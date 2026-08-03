export const compressData = async (data: any): Promise<Blob> => {
    const jsonString = JSON.stringify(data);
    
    const stream = new Blob([jsonString], { type: 'application/json' })
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
        
    return new Response(stream).blob();
};