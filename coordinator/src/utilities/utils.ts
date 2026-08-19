import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(zlib.gunzip);

// Converts a Base64 encoded GZIP string back into a JSON object.
export const decompressPayload = (base64Data: string): any => {
    try {
        const compressedBuffer = Buffer.from(base64Data, 'base64');

        const decompressed = zlib.gunzipSync(compressedBuffer);

        return JSON.parse(decompressed.toString('utf-8'));
    } catch (error) {
        console.error("Decompression failed:", error);
        return null;
    }
};

// Decompresses a GZIP-compressed binary payload into a JSON object.
export const decompressGzipResponse = async (data: Buffer | ArrayBuffer): Promise<any> => {
    try {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        const decompressedBuffer = await gunzipAsync(buffer);

        return JSON.parse(decompressedBuffer.toString('utf-8'));
    } catch (error) {
        console.error("Gzip response decompression failed:", error);
        throw error;
    }
};