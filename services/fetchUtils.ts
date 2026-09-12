export const fetchWithRetry = async (url: string, options: RequestInit, retries: number = 3, delayMs: number = 1000): Promise<Response> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      const response = await fetch(url, options);
      // We only retry on network failures or 5xx server errors
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }
      // If it's a 5xx or 429, we might want to retry
      if (attempt === retries - 1) return response;
    } catch (error) {
      if (attempt === retries - 1) throw error;
    }
    attempt++;
    await new Promise(r => setTimeout(r, delayMs * attempt)); // exponential backoff
  }
  throw new Error("Fetch failed after retries");
};
