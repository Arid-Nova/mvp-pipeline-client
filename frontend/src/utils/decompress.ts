import pako from 'pako';

/**
 * Converts a Base64 encoded GZIP string back into a JSON object.
 */
export const decompressPayload = (base64Data: string): any => {
    try {
        const binaryString = window.atob(base64Data);
        
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const decompressed = pako.ungzip(bytes, { to: 'string' });

        return JSON.parse(decompressed);
    } catch (error) {
        console.error("Decompression failed:", error);
        return null;
    }
};

export const decompressGzipResponse = async (blob: Blob) => {
    const ds = new DecompressionStream("gzip");
    const decompressedStream = blob.stream().pipeThrough(ds);
    const responseText = await new Response(decompressedStream).text();
    return JSON.parse(responseText);
};