import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { apiSignupCreator, apiSignupCustomer, loginUi, TEST_PASSWORD, uniqueEmail } from './helpers';

/** Each person has their own browser context, so their cookies and live streams are independent. */
interface Person {
  context: BrowserContext;
  page: Page;
  id: string;
  email: string;
  name: string;
}

const MODERATOR_EMAIL = 'moderator.e2e@example.com';

async function createPerson(browser: Browser, role: 'customer' | 'creator', name: string, overrides: Record<string, unknown> = {}): Promise<Person> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const email = (overrides.email as string) ?? uniqueEmail(name.toLowerCase().replace(/[^a-z]/g, ''));
  const account =
    role === 'customer'
      ? await apiSignupCustomer(page.request, { name, email, ...overrides })
      : await apiSignupCreator(page.request, { name, email, neighborhoods: ['Venice'], citywide: false, ...overrides });
  return { context, page, id: account.id, email, name };
}

/** Starts a conversation through the API, as the first message from `from` to `to`. Returns the conversation id. */
async function startConversation(from: Person, to: Person, body: string): Promise<string> {
  const response = await from.page.request.post(`/api/messages/with/${to.id}/messages`, {
    data: { clientId: `client-${Math.random().toString(36).slice(2, 12)}`, body },
  });
  expect(response.status(), await response.text()).toBe(201);
  const json = (await response.json()) as { conversation: { id: string } };
  return json.conversation.id;
}

async function sendViaApi(from: Person, conversationId: string, body: string): Promise<void> {
  const response = await from.page.request.post(`/api/messages/conversations/${conversationId}/messages`, {
    data: { clientId: `client-${Math.random().toString(36).slice(2, 12)}`, body },
  });
  expect(response.status(), await response.text()).toBe(201);
}

async function threadBodies(person: Person, conversationId: string): Promise<string[]> {
  const response = await person.page.request.get(`/api/messages/conversations/${conversationId}/messages`);
  expect(response.status()).toBe(200);
  const json = (await response.json()) as { messages: Array<{ body: string }> };
  return json.messages.map((message) => message.body);
}

async function openConversationAs(person: Person, conversationId: string) {
  await person.page.goto(`/messages/${conversationId}`);
  await expect(person.page.getByTestId('thread')).toBeVisible();
  await expect(person.page.getByTestId('message-list')).toBeVisible();
}

test.describe('Message button on profiles', () => {
  test('signed-out visitors see no messaging controls and receive no private data', async ({ page, request }) => {
    const creator = await apiSignupCreator(request, { name: 'Lena Ortiz', neighborhoods: ['Venice'], citywide: false });
    await page.goto(`/creators/${creator.id}`);
    await expect(page.getByRole('heading', { name: 'Lena Ortiz' })).toBeVisible();
    await expect(page.getByTestId('message-button')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Messages' })).toHaveCount(0);

    await page.goto('/messages');
    await expect(page).toHaveURL(/\/login\?next=%2Fmessages/);
    await expect(page.getByTestId('inbox')).toHaveCount(0);

    // The page's own request context is signed out. The `request` fixture above signed in to create the creator.
    const inbox = await page.request.get('/api/messages/conversations');
    expect(inbox.status()).toBe(401);
    expect(await inbox.text()).not.toContain('conversations');
    const stream = await page.request.get('/api/messages/stream');
    expect(stream.status()).toBe(401);
    const thread = await page.request.get(`/api/messages/conversations/${creator.id}/messages`);
    expect(thread.status()).toBe(401);
  });

  test('shows Message to other people only, with an accessible name, a chat icon, and the brand colour', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      await ava.page.goto(`/creators/${marisol.id}`);
      const button = ava.page.getByRole('button', { name: 'Message Marisol Vega' });
      await expect(button).toBeVisible();
      await expect(button).toContainText('Message');
      await expect(button.locator('svg')).toHaveCount(1);
      const colour = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(colour).toBe('rgb(225, 35, 37)');
      const box = await button.boundingBox();
      expect(box && box.height >= 44 && box.width >= 44).toBeTruthy();

      await ava.page.goto(`/customers/${ava.id}`);
      await expect(ava.page.getByTestId('message-button')).toHaveCount(0);

      await marisol.page.goto(`/customers/${ava.id}`);
      await expect(marisol.page.getByRole('button', { name: 'Message Ava Kim' })).toBeVisible();
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('the first message goes from a profile to the other person in real time and survives a refresh', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      await marisol.page.goto('/messages');
      await expect(marisol.page.getByTestId('inbox-empty')).toContainText(
        'Your conversations will appear here. Visit a creator or customer profile and select Message to get started.',
      );

      await ava.page.goto(`/creators/${marisol.id}`);
      await ava.page.getByTestId('message-button').click();
      await expect(ava.page).toHaveURL(/\/messages\/new\//);
      await ava.page.getByTestId('composer-input').fill('Hi Marisol, are you free for a March shoot in Venice?');
      await ava.page.getByTestId('send-message').click();
      await expect(ava.page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
      await expect(ava.page.getByTestId('message').filter({ hasText: 'free for a March shoot' })).toBeVisible();
      const conversationUrl = ava.page.url();

      // Marisol did not reload her page. The message and the unread count arrive through the live stream.
      await expect(marisol.page.getByTestId('conversation-item')).toHaveCount(1, { timeout: 10_000 });
      await expect(marisol.page.getByTestId('inbox-unread-total')).toContainText('1');

      await marisol.page.getByTestId('conversation-item').first().click();
      await expect(marisol.page.getByTestId('message').filter({ hasText: 'free for a March shoot' })).toBeVisible();

      await ava.page.reload();
      await marisol.page.reload();
      await expect(ava.page.getByTestId('message-list').getByText('free for a March shoot')).toBeVisible();
      await expect(marisol.page.getByTestId('message-list').getByText('free for a March shoot')).toBeVisible();

      // Going back to the profile opens the same conversation.
      await ava.page.goto(`/creators/${marisol.id}`);
      await ava.page.getByTestId('message-button').click();
      await expect(ava.page).toHaveURL(conversationUrl);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('simultaneous first messages from both sides create one conversation', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const [fromAva, fromMarisol] = await Promise.all([
        ava.page.request.post(`/api/messages/with/${marisol.id}/messages`, { data: { clientId: 'client-race-ava-01', body: 'Ava starts' } }),
        marisol.page.request.post(`/api/messages/with/${ava.id}/messages`, { data: { clientId: 'client-race-mar-01', body: 'Marisol replies' } }),
      ]);
      expect(fromAva.status()).toBe(201);
      expect(fromMarisol.status()).toBe(201);
      const avaConversation = ((await fromAva.json()) as { conversation: { id: string } }).conversation.id;
      const marisolConversation = ((await fromMarisol.json()) as { conversation: { id: string } }).conversation.id;
      expect(avaConversation).toBe(marisolConversation);

      const avaInbox = (await (await ava.page.request.get('/api/messages/conversations')).json()) as { conversations: unknown[] };
      const marisolInbox = (await (await marisol.page.request.get('/api/messages/conversations')).json()) as { conversations: unknown[] };
      expect(avaInbox.conversations).toHaveLength(1);
      expect(marisolInbox.conversations).toHaveLength(1);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });
});

test.describe('Private conversations', () => {
  test('a third person cannot open a conversation by URL, API, or live stream', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    const casey = await createPerson(browser, 'customer', 'Casey Lin');
    try {
      const conversationId = await startConversation(ava, marisol, 'Private plans for Saturday');

      await casey.page.goto(`/messages/${conversationId}`);
      await expect(casey.page.getByText('This conversation is not available.')).toBeVisible();
      await expect(casey.page.getByText('Private plans for Saturday')).toHaveCount(0);

      const thread = await casey.page.request.get(`/api/messages/conversations/${conversationId}/messages`);
      expect(thread.status()).toBe(404);
      const summary = await casey.page.request.get(`/api/messages/conversations/${conversationId}`);
      expect(summary.status()).toBe(404);

      // Listen on Casey's live stream while Ava and Marisol keep talking.
      const listening = casey.page.evaluate(
        () =>
          new Promise<string[]>((resolve) => {
            const received: string[] = [];
            const source = new EventSource('/api/messages/stream');
            for (const name of ['ready', 'message', 'conversation']) {
              source.addEventListener(name, (event) => received.push(`${name}:${(event as MessageEvent).data}`));
            }
            setTimeout(() => {
              source.close();
              resolve(received);
            }, 2500);
          }),
      );
      await sendViaApi(marisol, conversationId, 'Secret follow-up for the two of us');
      const received = await listening;
      expect(received.some((line) => line.startsWith('ready:'))).toBe(true);
      expect(received.join('\n')).not.toContain(conversationId);
      expect(received.join('\n')).not.toContain('Secret follow-up');
    } finally {
      await ava.context.close();
      await marisol.context.close();
      await casey.context.close();
    }
  });

  test('impersonation, participant changes and invalid input are rejected by the server', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Original message');
      const impersonate = await ava.page.request.post(`/api/messages/conversations/${conversationId}/messages`, {
        data: { clientId: 'client-impersonate-1', body: 'Sent as Marisol', senderId: marisol.id },
      });
      expect(impersonate.status()).toBe(400);
      const moveConversation = await ava.page.request.post(`/api/messages/conversations/${conversationId}/messages`, {
        data: { clientId: 'client-move-0001', body: 'Moved', conversationId: '00000000-0000-4000-8000-000000000000' },
      });
      expect(moveConversation.status()).toBe(400);
      const empty = await ava.page.request.post(`/api/messages/conversations/${conversationId}/messages`, {
        data: { clientId: 'client-empty-0001', body: '   ' },
      });
      expect(empty.status()).toBe(400);
      expect((await empty.json()).code).toBe('EMPTY_MESSAGE');
      const oversized = await ava.page.request.post(`/api/messages/conversations/${conversationId}/messages`, {
        data: { clientId: 'client-long-00001', body: 'a'.repeat(5001) },
      });
      expect(oversized.status()).toBe(400);
      expect((await oversized.json()).code).toBe('MESSAGE_TOO_LONG');

      const bodies = await threadBodies(marisol, conversationId);
      expect(bodies).toEqual(['Original message']);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('script-like text displays as plain text and links only web addresses', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    const dialogs: string[] = [];
    try {
      ava.page.on('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      });
      const conversationId = await startConversation(ava, marisol, 'Hello');
      await openConversationAs(ava, conversationId);
      const payload = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> see https://example.com/gallery';
      await ava.page.getByTestId('composer-input').fill(payload);
      await ava.page.getByTestId('send-message').click();

      const bubble = ava.page.getByTestId('message').filter({ hasText: '<script>' });
      await expect(bubble).toBeVisible();
      await expect(bubble).toContainText('<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>');
      await expect(ava.page.getByTestId('message-list').locator('img, script')).toHaveCount(0);
      const link = ava.page.getByTestId('message-list').getByRole('link', { name: 'https://example.com/gallery' });
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
      const pwned = await ava.page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned);
      expect(pwned).toBeUndefined();
      expect(dialogs).toEqual([]);

      await marisol.page.goto(`/messages/${conversationId}`);
      await expect(marisol.page.getByTestId('message').filter({ hasText: '<script>' })).toBeVisible();
      expect(await marisol.page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('a double-click sends once, and a retry after a lost response does not duplicate', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Opening note');
      await openConversationAs(ava, conversationId);

      const composer = ava.page.getByTestId('composer-input');
      await composer.fill('Double click test');
      await ava.page.getByTestId('send-message').dblclick();
      await expect(ava.page.getByTestId('message').filter({ hasText: 'Double click test' })).toHaveCount(1);

      // Each POST takes the next step. 'save-then-fail' stores the message but returns an error to the browser.
      // 'fail' returns an error without storing anything. Any other step reaches the server normally.
      const plan: Array<'save-then-fail' | 'fail' | 'continue'> = ['save-then-fail', 'fail'];
      let call = 0;
      await ava.page.route(`**/api/messages/conversations/${conversationId}/messages`, async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const step = plan[call] ?? 'continue';
        call += 1;
        if (step === 'continue') {
          await route.continue();
          return;
        }
        try {
          if (step === 'save-then-fail') {
            await ava.page.request.post(route.request().url(), {
              headers: { 'content-type': 'application/json' },
              data: route.request().postData() ?? '{}',
            });
          }
        } finally {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'The connection dropped before the reply arrived.', code: 'SERVER_ERROR', fieldErrors: {} }),
          });
        }
      });

      // The server stored this message, so the live confirmation replaces the outgoing bubble with exactly one message.
      await composer.fill('Lost reply message');
      await ava.page.getByTestId('send-message').click();
      await expect(ava.page.getByTestId('message').filter({ hasText: 'Lost reply message' })).toHaveCount(1);
      await expect(ava.page.getByText('Not sent')).toHaveCount(0);

      // Nothing was stored, so the failure shows, and Retry sends it once.
      await composer.fill('Retry test message');
      await ava.page.getByTestId('send-message').click();
      await expect(ava.page.getByText('Not sent')).toBeVisible();
      await expect(ava.page.getByTestId('outgoing-message')).toHaveAttribute('data-status', 'failed');
      await ava.page.getByTestId('retry-message').click();
      await expect(ava.page.getByTestId('message').filter({ hasText: 'Retry test message' })).toHaveCount(1);
      await expect(ava.page.getByText('Not sent')).toHaveCount(0);
      await ava.page.unroute(`**/api/messages/conversations/${conversationId}/messages`);

      const bodies = await threadBodies(ava, conversationId);
      expect(bodies.filter((body) => body === 'Double click test')).toHaveLength(1);
      expect(bodies.filter((body) => body === 'Lost reply message')).toHaveLength(1);
      expect(bodies.filter((body) => body === 'Retry test message')).toHaveLength(1);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('keyboard: Enter sends, Shift+Enter adds a line, and composition input is not sent early', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Keyboard check');
      await openConversationAs(ava, conversationId);
      const composer = ava.page.getByTestId('composer-input');

      await composer.fill('First line');
      await composer.press('Shift+Enter');
      await composer.pressSequentially('second line');
      await expect(composer).toHaveValue('First line\nsecond line');
      expect(await threadBodies(ava, conversationId)).toEqual(['Keyboard check']);

      // An Enter that belongs to input-method composition must not send unfinished text.
      await composer.evaluate((element) => {
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
      });
      await expect(composer).toHaveValue('First line\nsecond line');
      expect(await threadBodies(ava, conversationId)).toEqual(['Keyboard check']);

      await composer.press('Enter');
      await expect(composer).toHaveValue('');
      await expect(ava.page.getByTestId('message').filter({ hasText: 'second line' })).toBeVisible();
      expect(await threadBodies(ava, conversationId)).toEqual(['Keyboard check', 'First line\nsecond line']);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('the counter appears near the limit and Send stays disabled over 5,000 characters', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Start');
      await openConversationAs(ava, conversationId);
      const composer = ava.page.getByTestId('composer-input');
      const send = ava.page.getByTestId('send-message');

      await composer.fill('a'.repeat(4200));
      await expect(ava.page.getByTestId('message-counter')).toContainText('4,200 / 5,000');
      await expect(send).toBeEnabled();

      await composer.fill('a'.repeat(5001));
      await expect(ava.page.getByRole('alert')).toContainText('Remove 1 character to send this message.');
      await expect(send).toBeDisabled();

      await composer.fill('   ');
      await expect(send).toBeDisabled();
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });
});

test.describe('Unread counts, read positions and scrolling', () => {
  test('a message is not marked read until the newest message is on screen', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Message 1');
      for (let i = 2; i <= 40; i += 1) await sendViaApi(ava, conversationId, `Message ${i}`);

      await openConversationAs(marisol, conversationId);
      await expect(marisol.page.getByTestId('message-list').getByText('Message 40', { exact: true })).toBeVisible();
      await expect.poll(async () => (await (await marisol.page.request.get('/api/messages/unread')).json()).total).toBe(0);

      // Scroll up to older messages, then a new message arrives. It must stay unread until the reader returns to it.
      await marisol.page.getByTestId('message-list').evaluate((element) => {
        element.scrollTop = 0;
      });
      await sendViaApi(ava, conversationId, 'Arrived while reading history');
      await expect(marisol.page.getByTestId('new-messages')).toBeVisible();
      // Still unread on the server: the reader has not returned to the newest message.
      await expect.poll(async () => (await (await marisol.page.request.get('/api/messages/unread')).json()).total).toBe(1);
      await expect(marisol.page.getByTestId('message-list').getByText('Arrived while reading history')).toHaveCount(1);

      await marisol.page.getByTestId('new-messages').click();
      await expect(marisol.page.getByTestId('new-messages')).toHaveCount(0);
      await expect.poll(async () => (await (await marisol.page.request.get('/api/messages/unread')).json()).total, { timeout: 8000 }).toBe(0);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('new messages count up in the inbox badge until the thread is opened', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Hello there');
      await marisol.page.goto('/messages');
      await expect(marisol.page.getByTestId('inbox-unread-total')).toContainText('1');
      await sendViaApi(ava, conversationId, 'Second message');
      await expect(marisol.page.getByTestId('inbox-unread-total')).toContainText('2', { timeout: 10_000 });
      await expect(marisol.page.getByTestId('messages-unread').first()).toBeVisible();
      await marisol.page.getByTestId('conversation-item').first().click();
      await expect(marisol.page.getByTestId('inbox-unread-total')).toHaveCount(0, { timeout: 10_000 });
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('older messages load in place, keeping the reader\'s position', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Message 1');
      for (let i = 2; i <= 40; i += 1) await sendViaApi(ava, conversationId, `Message ${i}`);
      await openConversationAs(marisol, conversationId);
      const list = marisol.page.getByTestId('message-list');
      await list.evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect(marisol.page.getByTestId('load-older')).toBeVisible();
      // The first message on screen before loading. It must stay at the same place on screen afterwards.
      const anchor = list.getByText('Message 11', { exact: true });
      await expect(anchor).toBeVisible();
      const before = (await anchor.boundingBox())?.y ?? -1;

      await marisol.page.getByTestId('load-older').click();
      await expect(list.getByText('Message 1', { exact: true })).toBeVisible();
      const after = (await anchor.boundingBox())?.y ?? -1;
      expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });
});

test.describe('Blocking and reporting', () => {
  test('blocking stops messages both ways, keeps history, and unblocking restores them', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(ava, marisol, 'Before the block');
      await openConversationAs(ava, conversationId);
      await openConversationAs(marisol, conversationId);

      await marisol.page.getByTestId('conversation-menu-trigger').click();
      await marisol.page.getByTestId('menu-block').click();
      await marisol.page.getByTestId('block-confirm').click();
      await expect(marisol.page.getByTestId('block-done')).toBeVisible();
      await marisol.page.getByTestId('block-done').click();

      await expect(ava.page.getByTestId('composer-input')).toBeDisabled({ timeout: 10_000 });
      await expect(ava.page.getByTestId('composer-notice')).toContainText('Messaging is not available in this conversation.');
      await expect(marisol.page.getByTestId('composer-notice')).toContainText('You blocked Ava Kim.');
      await expect(ava.page.getByTestId('message-list').getByText('Before the block')).toBeVisible();

      const attempt = await ava.page.request.post(`/api/messages/conversations/${conversationId}/messages`, {
        data: { clientId: 'client-after-block', body: 'Still there?' },
      });
      expect(attempt.status()).toBe(403);

      await marisol.page.getByTestId('conversation-menu-trigger').click();
      await marisol.page.getByTestId('menu-unblock').click();
      await marisol.page.getByTestId('block-confirm').click();
      await marisol.page.getByTestId('block-done').click();
      await expect(ava.page.getByTestId('composer-input')).toBeEnabled({ timeout: 10_000 });
      await ava.page.getByTestId('composer-input').fill('Back on?');
      await ava.page.getByTestId('send-message').click();
      await expect(marisol.page.getByTestId('message-list').getByText('Back on?')).toBeVisible({ timeout: 10_000 });
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('a report keeps the selected messages for moderators only, and confirms to the reporter', async ({ browser }) => {
    // The reviewer account is created at startup from the bootstrap settings, so it signs in rather than signing up.
    const moderatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const moderatorPage = await moderatorContext.newPage();
    await loginUi(moderatorPage, MODERATOR_EMAIL, TEST_PASSWORD);
    const moderator: Person = { context: moderatorContext, page: moderatorPage, id: '', email: MODERATOR_EMAIL, name: 'Photo Shoot Reviewer' };
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      const conversationId = await startConversation(marisol, ava, 'A message that needs review');
      await openConversationAs(ava, conversationId);
      await ava.page.getByTestId('conversation-menu-trigger').click();
      await ava.page.getByTestId('menu-report').click();
      await ava.page.getByRole('radio', { name: 'Harassment or threats' }).click();
      await ava.page.getByRole('checkbox').first().click();
      await ava.page.getByTestId('report-details').fill('Repeated unwanted messages.');
      await ava.page.getByTestId('report-submit').click();
      await expect(ava.page.getByRole('heading', { name: 'Report sent' })).toBeVisible();
      await expect(ava.page.getByText('Marisol Vega has not been notified.')).toBeVisible();

      const reporterQueue = await ava.page.request.get('/api/moderation/reports');
      expect(reporterQueue.status()).toBe(403);
      const queue = await moderator.page.request.get('/api/moderation/reports');
      expect(queue.status()).toBe(200);
      const json = (await queue.json()) as { reports: Array<{ reason: string; details: string; evidence: Array<{ body: string }> }> };
      const report = json.reports.find((item) => item.details === 'Repeated unwanted messages.');
      expect(report?.reason).toBe('harassment');
      expect(report?.evidence[0]?.body).toBe('A message that needs review');
    } finally {
      await moderator.context.close();
      await ava.context.close();
      await marisol.context.close();
    }
  });
});

test.describe('Sign-out, expiry and account switching', () => {
  test('signing out closes the conversation, syncs other tabs, and a new account sees only its own inbox', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    const casey = await createPerson(browser, 'customer', 'Casey Lin');
    try {
      const conversationId = await startConversation(ava, marisol, 'Shared secret note');
      await openConversationAs(ava, conversationId);
      const otherTab = await ava.context.newPage();
      await otherTab.goto(`/messages/${conversationId}`);
      await expect(otherTab.getByTestId('thread')).toBeVisible();

      await ava.page.getByRole('button', { name: 'Account menu for Ava Kim' }).click();
      await ava.page.getByRole('menuitem', { name: /Log out/ }).click();
      await expect(ava.page).toHaveURL(/\/$/);

      // The other tab learns about the sign-out and leaves the protected view.
      await expect(otherTab).toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(otherTab.getByText('Shared secret note')).toHaveCount(0);

      const after = await ava.page.request.get('/api/messages/conversations');
      expect(after.status()).toBe(401);

      await loginUi(ava.page, casey.email, TEST_PASSWORD);
      await ava.page.goto('/messages');
      await expect(ava.page.getByTestId('inbox-empty')).toBeVisible();
      await expect(ava.page.getByText('Shared secret note')).toHaveCount(0);
    } finally {
      await ava.context.close();
      await marisol.context.close();
      await casey.context.close();
    }
  });
});

test.describe('Inbox states and mobile layout', () => {
  test('a failed inbox request shows a retry action that recovers', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    try {
      await startConversation(ava, marisol, 'Loaded after retry');
      await ava.page.route('**/api/messages/conversations', (route) => route.abort('failed'), { times: 1 });
      await ava.page.goto('/messages');
      await expect(ava.page.getByRole('alert')).toContainText("We couldn't reach Photo Shoot");
      await ava.page.getByRole('button', { name: 'Try again' }).click();
      await expect(ava.page.getByTestId('conversation-item')).toHaveCount(1);
    } finally {
      await ava.context.close();
      await marisol.context.close();
    }
  });

  test('on a phone the list comes first, a thread opens full screen with Back, and the composer stays reachable with the keyboard open', async ({ browser }) => {
    const ava = await createPerson(browser, 'customer', 'Ava Kim');
    const marisol = await createPerson(browser, 'creator', 'Marisol Vega');
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await phone.newPage();
    try {
      await loginUi(page, ava.email, TEST_PASSWORD);
      await startConversation(marisol, ava, 'Phone-friendly hello');
      await page.goto('/messages');
      await expect(page.getByTestId('inbox')).toBeVisible();
      await expect(page.getByTestId('thread')).toBeHidden();

      await page.getByTestId('conversation-item').first().tap();
      await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
      await expect(page.getByTestId('thread')).toBeVisible();
      await expect(page.getByTestId('inbox')).toBeHidden();
      await expect(page.getByTestId('thread-back')).toBeVisible();
      await expect(page.getByTestId('message').filter({ hasText: 'Phone-friendly hello' })).toBeVisible();

      // Simulate the on-screen keyboard by shrinking the viewport. Send must still be on screen.
      await page.getByTestId('composer-input').tap();
      await page.setViewportSize({ width: 390, height: 430 });
      await page.getByTestId('composer-input').fill('Typed with the keyboard open');
      const send = page.getByTestId('send-message');
      const box = await send.boundingBox();
      expect(box && box.y >= 0 && box.y + box.height <= 430).toBeTruthy();
      await send.tap();
      await expect(page.getByTestId('message').filter({ hasText: 'Typed with the keyboard open' })).toBeVisible();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByTestId('thread-back').tap();
      await expect(page).toHaveURL(/\/messages$/);
      await expect(page.getByTestId('inbox')).toBeVisible();
    } finally {
      await phone.close();
      await ava.context.close();
      await marisol.context.close();
    }
  });
});
