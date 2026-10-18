/**
 * Shared contract between `modules/line` and `modules/automation`.
 *
 * Allows the Automation Engine & Worker to dispatch messages through LINE
 * (both Official Account `@line/bot-sdk` and Personal `@evex/linejs`)
 * without tight coupling to internal pool implementation details.
 */

export interface LineSendResult {
  providerMessageId: string | null;
  sentVia?: 'reply_token' | 'push_api' | 'personal_e2ee';
}

export interface ILineDeliveryDispatcher {
  /**
   * Ensure the given LINE account is connected/ready in the pool.
   * For OA accounts, verifies credentials exist and instantiates LineBotClient.
   * For PERSONAL accounts, checks active Thrift/E2EE session or attempts reconnect.
   */
  ensureAccountReady(lineAccountId: number): Promise<boolean>;

  /**
   * Send a 1-1 message to a target LINE user (`U...` or MID).
   * Automatically uses cached `reply_token` if unexpired (0 quota),
   * falling back to `pushMessage` with `X-Line-Retry-Key` (OA) or E2EE `sendMessage` (PERSONAL).
   */
  sendPersonalMessage(params: {
    lineAccountId: number;
    targetLineUid: string;
    content: string;
    retryKey?: string;
    sentVia?: 'user' | 'automation' | 'system';
  }): Promise<LineSendResult>;

  /**
   * Send a group message to a target LINE group (`C...` or MID).
   */
  sendGroupMessage(params: {
    lineAccountId: number;
    targetLineGroupId: string;
    content: string;
    retryKey?: string;
    sentVia?: 'user' | 'automation' | 'system';
  }): Promise<LineSendResult>;
}

let _registeredDispatcher: ILineDeliveryDispatcher | null = null;

export function registerLineDeliveryDispatcher(dispatcher: ILineDeliveryDispatcher): void {
  _registeredDispatcher = dispatcher;
}

export function getLineDeliveryDispatcher(): ILineDeliveryDispatcher | null {
  return _registeredDispatcher;
}
