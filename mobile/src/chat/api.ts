import { api } from '../api/client';
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  CreateOfferInput,
  RespondOfferInput,
  SendMessageInput,
} from './types';

export async function fetchConversations(): Promise<ConversationSummary[]> {
  return api<ConversationSummary[]>('/conversations');
}

export async function openOrCreateConversation(listingId: string): Promise<ConversationDetail> {
  return api<ConversationDetail>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ listingId }),
  });
}

export async function fetchConversationDetail(conversationId: string): Promise<ConversationDetail> {
  return api<ConversationDetail>(`/conversations/${conversationId}`);
}

export async function sendChatMessage(
  conversationId: string,
  input: SendMessageInput,
): Promise<ChatMessage> {
  return api<ChatMessage>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createPriceOffer(
  conversationId: string,
  input: CreateOfferInput,
): Promise<ConversationDetail> {
  return api<ConversationDetail>(`/conversations/${conversationId}/offers`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function respondToPriceOffer(
  conversationId: string,
  messageId: string,
  input: RespondOfferInput,
): Promise<ConversationDetail> {
  return api<ConversationDetail>(`/conversations/${conversationId}/offers/${messageId}/respond`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
