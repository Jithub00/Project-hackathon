import { Fragment, type ReactNode } from 'react';

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/**
 * Turns web addresses into links. Everything else is plain text that React escapes, so markup or script in a
 * message is displayed as written and never runs. Only http and https links are created.
 */
export function linkify(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="break-all underline underline-offset-4 hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
