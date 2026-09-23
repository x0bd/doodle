//! Thumbnails (plan §10.2). The field shows images small — a take in a
//! bloom, a card's picture, a run in the history — and reading the
//! original for each is the one thing that would not scale to hundreds.
//! So each asset gets a derivative per size, made once, kept beside it:
//! `thumbs/<hash>-<size>.<jpg|png>`. Derivatives are a cache: never in an
//! archive (only `assets/` is), always remade from the original if gone.

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use base64::Engine;

/// the sizes asked for are clamped to these, so a caller cannot fill the
/// disk with one derivative per pixel
const SIZES: [u32; 3] = [256, 512, 1024];

fn nearest(size: u32) -> u32 {
    *SIZES.iter().find(|s| **s >= size).unwrap_or(&SIZES[SIZES.len() - 1])
}

fn mime(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

fn data_url(ext: &str, bytes: &[u8]) -> String {
    format!("data:{};base64,{}", mime(ext), base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// A thumbnail's bytes and extension, made if it is not there yet. An image
/// already no larger than the size is its own thumbnail (nothing written);
/// one that cannot be decoded here (AVIF) is too.
pub fn thumb(dir: &Path, rel: &str, size: u32) -> Result<(Vec<u8>, String), String> {
    if rel.contains("..") || !rel.starts_with("assets/") {
        return Err("Not an asset path".into());
    }
    let src = dir.join(rel);
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let stem = src.file_stem().and_then(|s| s.to_str()).ok_or("No name")?.to_string();
    let size = nearest(size);

    let cached = |e: &str| dir.join(format!("thumbs/{stem}-{size}.{e}"));
    for e in ["jpg", "png"] {
        if let Ok(bytes) = fs::read(cached(e)) {
            return Ok((bytes, e.to_string()));
        }
    }

    let original = fs::read(&src).map_err(|e| e.to_string())?;
    let format = match ext.as_str() {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "webp" => Some(ImageFormat::WebP),
        "gif" => Some(ImageFormat::Gif),
        _ => None,
    };
    let Some(format) = format else { return Ok((original, ext)) };
    let img = image::load_from_memory_with_format(&original, format).map_err(|e| e.to_string())?;
    if img.width().max(img.height()) <= size {
        return Ok((original, ext));
    }

    let small = img.resize(size, size, FilterType::Triangle);
    // a picture with transparency keeps it; anything else is a JPEG
    let (bytes, out_ext) = if small.color().has_alpha() {
        let mut buf = Cursor::new(Vec::new());
        small.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
        (buf.into_inner(), "png")
    } else {
        let mut buf = Vec::new();
        let rgb = DynamicImage::ImageRgb8(small.to_rgb8());
        JpegEncoder::new_with_quality(&mut buf, 84).encode_image(&rgb).map_err(|e| e.to_string())?;
        (buf, "jpg")
    };

    fs::create_dir_all(dir.join("thumbs")).map_err(|e| e.to_string())?;
    let target = cached(out_ext);
    let tmp = dir.join(format!("thumbs/.{stem}-{size}.tmp"));
    fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok((bytes, out_ext.to_string()))
}

/// Where a thumbnail is on disk, made if it is not there — or the original,
/// when the original is already small enough (or cannot be read here).
pub fn thumb_file(dir: &Path, rel: &str, size: u32) -> Result<PathBuf, String> {
    let (_, ext) = thumb(dir, rel, size)?;
    let stem = Path::new(rel).file_stem().and_then(|s| s.to_str()).ok_or("No name")?;
    let made = dir.join(format!("thumbs/{stem}-{}.{ext}", nearest(size)));
    Ok(if made.is_file() { made } else { dir.join(rel) })
}

/// The thumbnail as a data URL, made off the main thread.
#[tauri::command]
pub async fn read_thumb(dir: String, rel: String, size: u32) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (bytes, ext) = thumb(&PathBuf::from(dir), &rel, size)?;
        Ok(data_url(&ext, &bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage, Rgba, RgbaImage};

    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("doodle-thumbs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(d.join("assets")).unwrap();
        d
    }

    fn png(img: DynamicImage) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, ImageFormat::Png).unwrap();
        buf.into_inner()
    }

    #[test]
    fn a_large_image_gets_a_smaller_one_made_once() {
        let d = scratch("large");
        let img = DynamicImage::ImageRgb8(RgbImage::from_pixel(1200, 800, Rgb([200, 120, 40])));
        fs::write(d.join("assets/abc.png"), png(img)).unwrap();

        let (bytes, ext) = thumb(&d, "assets/abc.png", 500).unwrap();
        assert_eq!(ext, "jpg", "no transparency: a JPEG");
        let t = image::load_from_memory(&bytes).unwrap();
        assert_eq!((t.width(), t.height()), (512, 341), "the nearest size, the shape kept");
        assert!(d.join("thumbs/abc-512.jpg").is_file(), "kept beside the assets");

        // the second time it is read, not made
        fs::write(d.join("thumbs/abc-512.jpg"), b"cached").unwrap();
        let (again, _) = thumb(&d, "assets/abc.png", 512).unwrap();
        assert_eq!(again, b"cached");
    }

    #[test]
    fn transparency_is_kept_and_small_images_are_their_own() {
        let d = scratch("alpha");
        let img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(900, 900, Rgba([0, 0, 0, 10])));
        fs::write(d.join("assets/a.png"), png(img)).unwrap();
        let (_, ext) = thumb(&d, "assets/a.png", 256).unwrap();
        assert_eq!(ext, "png");

        let tiny = png(DynamicImage::ImageRgb8(RgbImage::new(100, 60)));
        fs::write(d.join("assets/t.png"), &tiny).unwrap();
        let (bytes, ext) = thumb(&d, "assets/t.png", 512).unwrap();
        assert_eq!((bytes, ext.as_str()), (tiny, "png"));
        assert!(!d.join("thumbs/t-512.jpg").exists(), "nothing written for an image already small");
    }

    #[test]
    fn only_assets_are_read() {
        let d = scratch("path");
        assert!(thumb(&d, "../secret.png", 256).is_err());
        assert!(thumb(&d, "graph.json", 256).is_err());
    }
}
