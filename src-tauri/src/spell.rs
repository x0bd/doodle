//! Spelling (PLAN.md M2.8): the Mac's own checker, asked by Doodle rather
//! than by WebKit — so the page can leave a book's own words (its people,
//! its places, what the writer taught it) unmarked, which WebKit's checker
//! cannot be told for one document without writing to the system-wide list.
//! The page sends paragraphs; this says where in each (UTF-16 offsets, as
//! JavaScript counts) the misspelt words are, and what the Mac would guess.

#[cfg(target_os = "macos")]
mod mac {
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSRange, NSString};

    pub fn misspelt(text: &str) -> Vec<(usize, usize)> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let s = NSString::from_str(text);
        let total = s.length();
        let mut out = Vec::new();
        let mut from = 0usize;
        while from < total {
            // never wrapping round to the start: the loop walks forward
            let r: NSRange = unsafe { checker.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(&s, from as isize, None, false, 0, std::ptr::null_mut()) };
            if r.length == 0 || r.location >= total || r.location < from {
                break;
            }
            out.push((r.location, r.length));
            from = r.location + r.length;
        }
        out
    }

    pub fn guesses(word: &str) -> Vec<String> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let s = NSString::from_str(word);
        let range = NSRange::new(0, s.length());
        checker
            .guessesForWordRange_inString_language_inSpellDocumentWithTag(range, &s, None, 0)
            .map(|a| a.iter().map(|g| g.to_string()).take(6).collect())
            .unwrap_or_default()
    }
}

/// For each paragraph, where its misspelt words are: `[start, length]` pairs.
#[tauri::command]
pub fn spell_check(paragraphs: Vec<String>) -> Vec<Vec<(usize, usize)>> {
    #[cfg(target_os = "macos")]
    return paragraphs.iter().map(|p| mac::misspelt(p)).collect();
    #[cfg(not(target_os = "macos"))]
    return paragraphs.iter().map(|_| Vec::new()).collect();
}

/// What the Mac would put in a misspelt word's place, best first.
#[tauri::command]
pub fn spell_guesses(word: String) -> Vec<String> {
    #[cfg(target_os = "macos")]
    return mac::guesses(&word);
    #[cfg(not(target_os = "macos"))]
    return { let _ = word; Vec::new() };
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn finds_misspelt_words_in_utf16_offsets() {
        // an em dash is one UTF-16 unit, as JavaScript counts it
        let r = spell_check(vec!["The shipp is — here at first lihgt.".into(), "All well.".into()]);
        assert_eq!(r[0], vec![(4, 5), (29, 5)]);
        assert!(r[1].is_empty());
        assert!(spell_guesses("lihgt".into()).iter().any(|g| g == "light"));
    }
}
