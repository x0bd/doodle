/**
 * Looks: styles with a name, picked up in one choice — the preset buttons
 * Visual Electric set beside its prompt, kept here as what they are in a
 * graph: a style node's description, palette and lighting, filled in and
 * still yours to change. A voice for words is a style too; these are for
 * pictures.
 */
export interface Look {
  description: string;
  palette: string;
  lighting: string;
}

export const LOOKS: Record<string, Look> = {
  Marker: { description: "Alcohol marker illustration, confident strokes, visible overlaps, paper grain", palette: "Warm greys, one saturated accent", lighting: "Flat, shapes carry the form" },
  Risograph: { description: "Risograph print, two-colour overprint, halftone grain, slight misregistration", palette: "Fluorescent pink, federal blue, paper white", lighting: "Flat, no shadows" },
  "Classic animation": { description: "Hand-painted cel animation, clean ink lines, painted backgrounds", palette: "Soft gouache backgrounds, bright cels", lighting: "Warm key light, painted shadows" },
  "3D render": { description: "Soft 3D render, rounded forms, subsurface materials, shallow depth of field", palette: "Pastel, matte", lighting: "Large softbox, gentle ambient occlusion" },
  Airbrush: { description: "Seventies airbrush illustration, smooth gradients, chrome highlights", palette: "Sunset orange to violet", lighting: "Rim light, glints" },
  "Stained glass": { description: "Stained glass window, lead lines between pieces of coloured glass", palette: "Cobalt, ruby, amber, emerald", lighting: "Backlit, light through the glass" },
  Watercolour: { description: "Loose watercolour, wet edges, blooms, white of the paper left", palette: "Muted washes, a few pigments", lighting: "Soft daylight" },
  "Film noir": { description: "Black and white film still, deep shadows, rain on glass", palette: "Monochrome, crushed blacks", lighting: "Hard single source, venetian blind shadows" },
  Woodblock: { description: "Ukiyo-e woodblock print, flat areas of colour, carved outlines, wood grain", palette: "Prussian blue, vermilion, bone", lighting: "Flat" },
  Polaroid: { description: "Instant film snapshot, soft focus, faded colour, white border", palette: "Faded cyan and warm highlights", lighting: "On-camera flash" },
  Blueprint: { description: "Technical blueprint, white line drawing, annotations and dimensions", palette: "Prussian blue ground, white lines", lighting: "None, a drawing" },
  Claymation: { description: "Stop-motion claymation, fingerprints in the clay, miniature set", palette: "Saturated plasticine", lighting: "Small practical lamps, soft shadows" },
};
