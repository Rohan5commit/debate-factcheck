import { NextRequest, NextResponse } from "next/server";
import { getDocumentProxy, extractText } from "unpdf";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, TXT, or Markdown." },
        { status: 400 }
      );
    }

    logger.info("Upload request", {
      filename: file.name,
      type: file.type,
      size: file.size,
    });

    let text: string;
    let pageCount: number | undefined;

    if (file.type === "application/pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buffer);
      pageCount = pdf.numPages;
      const result = await extractText(pdf);
      text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
    } else {
      text = await file.text();
    }

    return NextResponse.json({
      text,
      filename: file.name,
      pageCount,
    });
  } catch (e) {
    logger.error("Upload failed", { error: String(e) });
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
