import type { Attachment, Modality } from '@chat/sdk';
import { extractPdfText } from './pdf-convert';
import { logger } from './logger';

/**
 * Converts multer in-memory file buffers to SDK Attachment objects. Each file's
 * buffer is converted to a data URI matching the format previously produced by
 * FileReader.readAsDataURL().
 *
 * For PDFs (`application/pdf`), the text content is extracted eagerly at upload
 * time using `extractPdfText` and stored on the attachment as `extractedText` +
 * `pageCount`. This lets downstream code route the PDF to text-only models
 * without re-parsing the binary. Extraction errors are soft-fail: the PDF still
 * becomes an attachment, just without the text fields.
 *
 * No disk writes — all conversions happen in memory.
 */
export async function extractAttachments(files: Express.Multer.File[]): Promise<Attachment[]> {
  return Promise.all(
    files.map(async (file): Promise<Attachment> => {
      const base64 = `data:${file.mimetype};base64,${Buffer.from(file.buffer).toString('base64')}`;
      const isImage = file.mimetype.startsWith('image/');
      const isPdf = file.mimetype === 'application/pdf';
      const type: Modality = isImage ? 'image' : isPdf ? 'pdf' : 'file';

      const attachment: Attachment = {
        type,
        base64,
        mimeType: file.mimetype,
        name: file.originalname,
      };

      if (isPdf) {
        try {
          const { text, pageCount, truncated } = await extractPdfText(file.buffer);
          attachment.extractedText = text;
          attachment.pageCount = pageCount;
          if (truncated) {
            logger.warn(
              { name: file.originalname, pageCount },
              'pdf: extraction truncated to 50K chars'
            );
          }
        } catch (err) {
          logger.error(
            { err, name: file.originalname },
            'pdf: extraction failed, sending as opaque file'
          );
          // Soft fail: attachment stays type:"pdf" with base64 but no extractedText.
          // Models that support PDF natively can still read it; models that don't
          // fall back to the legacy "[File: name.pdf]" placeholder in convertMessages.
        }
      }

      return attachment;
    })
  );
}
