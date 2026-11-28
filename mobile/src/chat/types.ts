export type ListingType = 'BAN_LE' | 'BAN_COMBO' | 'CHO_TANG';

export type ListingStatus =
  | 'NHAP'
  | 'CHO_DUYET'
  | 'CONG_KHAI'
  | 'GIU_CHO'
  | 'DA_RUT'
  | 'AN'
  | 'HET_HAN'
  | 'KET_THUC';

export type MessageType = 'VAN_BAN' | 'DE_NGHI_GIA';

export type OfferStatus = 'CHO_PHAN_HOI' | 'DA_DONG_Y' | 'DA_TU_CHOI' | 'DA_THAY_THE';

export type OfferAction = 'ACCEPT' | 'REJECT' | 'COUNTER';

export type RestrictionReason =
  | 'ACCOUNT_RESTRICTED'
  | 'COUNTERPARTY_RESTRICTED'
  | 'LISTING_NOT_AVAILABLE'
  | 'FREE_LISTING_NO_NEGOTIATION'
  | null;

export interface Participant {
  id: string;
  name: string;
}

export interface ListingSummary {
  id: string;
  title: string;
  description: string | null;
  price: number;
  seller: string;
  sellerId: string;
  listingType: ListingType;
  status: ListingStatus;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sequenceNumber: number;
  conversationVersion?: number | null;
  senderId: string;
  senderName: string;
  type: MessageType;
  messageType: MessageType;
  content: string;
  offeredPrice: number | null;
  offerStatus: OfferStatus | null;
  responseAction: OfferAction | null;
  responseNote: string | null;
  respondedById: string | null;
  parentOfferId: string | null;
  clientMessageId: string | null;
  canRespond: boolean;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
}

export interface ConversationSummary {
  id: string;
  listing: ListingSummary | null;
  listingId: string | null;
  listingTitle: string | null;
  listingPrice: number | null;
  listingType: ListingType | null;
  listingStatus: ListingStatus | null;
  buyer: Participant;
  buyerId: string;
  buyerName: string;
  seller: Participant;
  sellerId: string;
  sellerName: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyStatus: string;
  counterpartyRestricted?: boolean;
  agreedPrice: number | null;
  pendingOfferId: string | null;
  pendingOfferPrice: number | null;
  pendingOfferSenderId: string | null;
  lastMessage: ChatMessage | null;
  canSendMessage: boolean;
  canMakeOffer: boolean;
  restrictionReason: RestrictionReason;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  currentUserId: string;
  listing: ListingSummary | null;
  listingId: string | null;
  listingTitle: string | null;
  listingPrice: number | null;
  listingType: ListingType | null;
  listingStatus: ListingStatus | null;
  buyer: Participant;
  buyerId: string;
  buyerName: string;
  seller: Participant;
  sellerId: string;
  sellerName: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyStatus: string;
  counterpartyRestricted?: boolean;
  agreedPrice: number | null;
  agreedOfferId: string | null;
  pendingOfferId: string | null;
  pendingOfferPrice: number | null;
  pendingOfferSenderId: string | null;
  reservationNotice: string | null;
  canSendMessage: boolean;
  canMakeOffer: boolean;
  restrictionReason: RestrictionReason;
  messages: ChatMessage[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PendingOutgoingMessage {
  clientMessageId: string;
  conversationId: string;
  content: string;
  status: 'sending' | 'failed';
  error?: string;
  retryable?: boolean;
  createdAt: string;
}

export interface SendMessageInput {
  content: string;
  clientMessageId: string;
}

export interface CreateOfferInput {
  offeredPrice: number;
  note?: string;
  clientMessageId?: string;
}

export interface RespondOfferInput {
  action: OfferAction;
  counterPrice?: number;
  note?: string;
  clientMessageId?: string;
}
