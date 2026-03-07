import { readFileAsBase64 } from "./image.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type FileKind = "image" | "dicom" | "pdf" | "document" | "unsupported";

export interface FileAttachment {
  name: string;
  base64: string;
  mediaType: string;
  kind: FileKind;
  originalName: string;
  sizeBytes: number;
  /** Extracted text content for document types (md, docx, xlsx, pptx) */
  extractedText?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/** Map of supported extensions to their file kind */
export const SUPPORTED_EXTENSIONS: Record<string, FileKind> = {
  ".dcm": "dicom",
  ".md": "document",
  ".docx": "document",
  ".xlsx": "document",
  ".pptx": "document",
  ".pdf": "pdf",
};

/** Extensions string for <input accept="..."> */
export const FILE_INPUT_ACCEPT = "image/*,.dcm,.md,.pdf,.docx,.xlsx,.pptx";

// ─── Classification ──────────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export function classifyFile(file: File): FileKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";

  const ext = getExtension(file.name);
  if (ext in SUPPORTED_EXTENSIONS) return SUPPORTED_EXTENSIONS[ext];

  // Fallback MIME checks for documents without extension
  if (file.type === "text/markdown") return "document";

  return "unsupported";
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `${file.name} is too large (${sizeMB}MB). Maximum is 50MB.` };
  }

  const kind = classifyFile(file);
  if (kind === "unsupported") {
    return { valid: false, error: `${file.name} is not a supported file type.` };
  }

  return { valid: true };
}

// ─── Processing ──────────────────────────────────────────────────────────────

/** Process multiple files, skipping invalid ones and returning errors. */
export async function processFiles(
  files: File[],
): Promise<{ attachments: FileAttachment[]; errors: string[] }> {
  const attachments: FileAttachment[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const validation = validateFile(file);
    if (!validation.valid) {
      errors.push(validation.error!);
      continue;
    }

    try {
      const kind = classifyFile(file);
      let attachment: FileAttachment;

      switch (kind) {
        case "image":
          attachment = await processImageFile(file);
          break;
        case "dicom":
          attachment = await processDicomFile(file);
          break;
        case "pdf":
          attachment = await processPdfFile(file);
          break;
        case "document":
          attachment = await processDocumentFile(file);
          break;
        default:
          errors.push(`${file.name} is not a supported file type.`);
          continue;
      }

      attachments.push(attachment);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Failed to process ${file.name}: ${msg}`);
    }
  }

  return { attachments, errors };
}

async function processImageFile(file: File): Promise<FileAttachment> {
  const { base64, mediaType } = await readFileAsBase64(file);
  return {
    name: file.name,
    base64,
    mediaType,
    kind: "image",
    originalName: file.name,
    sizeBytes: file.size,
  };
}

async function processDicomFile(file: File): Promise<FileAttachment> {
  const dicomParser = await import("dicom-parser");
  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  // Extract pixel data dimensions
  const rows = dataSet.uint16("x00280010") ?? 0;
  const cols = dataSet.uint16("x00280011") ?? 0;
  const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
  const pixelDataElement = dataSet.elements["x7fe00010"];

  if (!pixelDataElement || rows === 0 || cols === 0) {
    throw new Error("DICOM file has no renderable pixel data");
  }

  // Render to canvas as grayscale PNG
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot create canvas context");

  const imageData = ctx.createImageData(cols, rows);

  if (bitsAllocated === 16) {
    const pixelData = new Int16Array(
      byteArray.buffer,
      pixelDataElement.dataOffset,
      rows * cols,
    );
    // Window/level: simple min-max normalization
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i] < min) min = pixelData[i];
      if (pixelData[i] > max) max = pixelData[i];
    }
    const range = max - min || 1;
    for (let i = 0; i < pixelData.length; i++) {
      const val = Math.round(((pixelData[i] - min) / range) * 255);
      imageData.data[i * 4] = val;
      imageData.data[i * 4 + 1] = val;
      imageData.data[i * 4 + 2] = val;
      imageData.data[i * 4 + 3] = 255;
    }
  } else {
    // 8-bit pixel data
    const pixelData = new Uint8Array(
      byteArray.buffer,
      pixelDataElement.dataOffset,
      rows * cols,
    );
    for (let i = 0; i < pixelData.length; i++) {
      imageData.data[i * 4] = pixelData[i];
      imageData.data[i * 4 + 1] = pixelData[i];
      imageData.data[i * 4 + 2] = pixelData[i];
      imageData.data[i * 4 + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];

  return {
    name: file.name,
    base64,
    mediaType: "image/png",
    kind: "dicom",
    originalName: file.name,
    sizeBytes: file.size,
  };
}

async function processPdfFile(file: File): Promise<FileAttachment> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), ""),
  );
  return {
    name: file.name,
    base64,
    mediaType: "application/pdf",
    kind: "pdf",
    originalName: file.name,
    sizeBytes: file.size,
  };
}

async function processDocumentFile(file: File): Promise<FileAttachment> {
  const ext = getExtension(file.name);
  let extractedText: string;

  switch (ext) {
    case ".md":
      extractedText = await extractMarkdownText(file);
      break;
    case ".docx":
      extractedText = await extractDocxText(file);
      break;
    case ".xlsx":
      extractedText = await extractXlsxText(file);
      break;
    case ".pptx":
      extractedText = await extractPptxText(file);
      break;
    default:
      extractedText = await file.text();
  }

  // Store a placeholder base64 (the text content encoded) for consistency
  const base64 = btoa(unescape(encodeURIComponent(extractedText)));

  return {
    name: file.name,
    base64,
    mediaType: "text/plain",
    kind: "document",
    originalName: file.name,
    sizeBytes: file.size,
    extractedText,
  };
}

async function extractMarkdownText(file: File): Promise<string> {
  return file.text();
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractXlsxText(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`[Sheet: ${sheetName}]\n${csv}`);
  }
  return parts.join("\n\n");
}

async function extractPptxText(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort();

  const parts: string[] = [];
  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async("text");
    // Extract text from <a:t> elements
    const texts: string[] = [];
    const regex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      texts.push(match[1]);
    }
    if (texts.length > 0) {
      const slideNum = slideFile.match(/slide(\d+)/)?.[1] ?? "?";
      parts.push(`[Slide ${slideNum}]\n${texts.join(" ")}`);
    }
  }

  return parts.join("\n\n");
}
