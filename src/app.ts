import { openai } from '@ai-sdk/openai';
import {
  createUIMessageStream,
  pipeAgentUIStreamToResponse,
  pipeUIMessageStreamToResponse,
  streamText,
} from 'ai';
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { logTests } from './log-tests.js';
import { openaiWebSearchAgent } from './openai-web-search-agent.js';

const app = express();
app.use('/log-tests', logTests);
app.use(express.json());

// Keep access logs for the AI examples outside the log-count tests.
app.use((req: Request, _res: Response, next) => {
  console.log(`[${req.method}] ${req.path}`);
  next();
});

const prompt = 'Invent a new holiday and describe its traditions.';

app.get('/', (_req: Request, res: Response) => {
  res.send(
    `<html><body>
      <p><a href="/log-tests">ESA 即时日志测试</a></p>
      <script>document.querySelector('a').search = window.location.search;</script>
      <form method="POST">
        <button type="submit">${prompt}</button>
      </form>
    </body></html>`,
  );
});

app.post('/', async (req: Request, res: Response) => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  result.pipeUIMessageStreamToResponse(res);
});

app.post('/chat', async (request: Request, response: Response) => {
  pipeAgentUIStreamToResponse({
    agent: openaiWebSearchAgent,
    uiMessages: request.body.messages,
    response,
  });
});

app.post('/custom-data-parts', async (req: Request, res: Response) => {
  pipeUIMessageStreamToResponse({
    response: res,
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: 'start' });

        writer.write({
          type: 'data-custom',
          data: {
            custom: 'Hello, world!',
          },
        });

        const result = streamText({
          model: openai('gpt-4o'),
          prompt: 'Invent a new holiday and describe its traditions.',
        });

        writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    }),
  });
});

export default app;
