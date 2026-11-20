import {
  SUPPORTED_EXTENSIONS,
  type SupportedExtension,
} from '@/lib/document-types';

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

export function validateFileMetadata(
  fileName: string,
  fileSize: number,
): SupportedExtension {
  const extension = getFileExtension(fileName);

  if (!SUPPORTED_EXTENSIONS.includes(extension as SupportedExtension)) {
    throw new Error('暂不支持该文件格式，请上传 .docx、.pdf 或 .doc 文档。');
  }

  if (fileSize <= 0) {
    throw new Error('文件内容为空，请选择包含有效内容的文档。');
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error('文件超过 20MB，请压缩文档或拆分后重新上传。');
  }

  return extension as SupportedExtension;
}

export function validateFileSignature(
  buffer: Buffer,
  extension: SupportedExtension,
): void {
  const isValid =
    extension === 'docx'
      ? buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
      : extension === 'pdf'
        ? buffer.subarray(0, 5).toString('ascii') === '%PDF-'
        : buffer.length >= 8 &&
          buffer.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1';

  if (!isValid) {
    const label = extension === 'docx' ? 'DOCX' : extension.toUpperCase();
    throw new Error(`文件内容与 .${extension} 扩展名不一致，请上传有效的 ${label} 文档。`);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
