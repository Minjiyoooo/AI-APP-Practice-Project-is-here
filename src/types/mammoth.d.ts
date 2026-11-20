declare module 'mammoth' {
  interface MammothMessage {
    type: string;
    message: string;
  }

  interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }

  interface ConvertOptions {
    styleMap?: string[];
    includeDefaultStyleMap?: boolean;
  }

  const mammoth: {
    convertToHtml(
      input: { buffer: Buffer },
      options?: ConvertOptions,
    ): Promise<MammothResult>;
  };

  export default mammoth;
}
