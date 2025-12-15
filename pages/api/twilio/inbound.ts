import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: { bodyParser: true }, // Twilio sends form-encoded params; Next parses it fine
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Twilio sends Body/From
  const msg = ((req.body?.Body ?? '') as string).trim();
  const body = msg.toUpperCase();

  if (body === 'HELP') {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(`
      <Response>
        <Message>
          Got A Guy: This number sends work schedule notifications. Contact your manager for help. Reply STOP to opt out.
        </Message>
      </Response>
    `);
  }

  // For STOP, Twilio will automatically enforce opt-out system-wide.
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(`<Response></Response>`);
}
