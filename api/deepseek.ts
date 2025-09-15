// Example for Vercel Edge Functions (api/deepseek.ts)
// You may need to adapt this for your specific hosting provider.

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  // 1. Get the prompt and history from the frontend's request
  const { history } = await req.json();

  // 2. Add your secret DeepSeek API key from an environment variable
  // IMPORTANT: You must set DEEPSEEK_API_KEY in your hosting provider's dashboard.
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

  if (!DEEPSEEK_API_KEY) {
    return new Response('API key not configured on the server.', { status: 500 });
  }

  // 3. Call the real DeepSeek API
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat', // Or another model you prefer
      messages: history, // Assuming your history format matches
      stream: true, // Enable streaming
    }),
  });

  // 4. Stream the response back to your frontend
  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}
