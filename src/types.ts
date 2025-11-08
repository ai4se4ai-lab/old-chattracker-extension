export type TaskStatus = 'completed' | 'in-progress' | 'failed';
export type CursorEventType = 'beforeSubmitPrompt' | 'afterAgentResponse' | 'chat-summary';

export interface ChatSummary {
    id: string;
    timestamp: string;
    userPrompt: string;
    userObjectives: string[];
    aiResponseSummary: string;
    mainActions: string[];
    modifiedFiles: string[];
    taskStatus: TaskStatus;
}

export interface ApiRequest {
    connectionCode: string;
    eventType: string;
    status: TaskStatus;
    summary: ChatSummary;
}

/**
 * Raw event data from Cursor (may have various field names)
 */
export interface CursorRawEvent {
    [key: string]: any;
    eventType?: string;
    user_input?: string;
    userPrompt?: string;
    prompt?: string;
    chatTitle?: string;
    title?: string;
    aiResponse?: string;
    response?: string;
    agentResponse?: string;
    affectedFiles?: string[];
    files?: string[];
    modifiedFiles?: string[];
    status?: string;
    timestamp?: string;
    metadata?: any;
}

/**
 * Normalized hook event data
 */
export interface HookEventData {
    eventType: CursorEventType;
    chatTitle: string;
    userPrompt: string;
    aiResponse?: string;
    affectedFiles: string[];
    status: TaskStatus;
    timestamp: string;
    metadata: any;
    itineraryId?: string;
}

/**
 * Paired chat event (beforeSubmitPrompt + afterAgentResponse)
 */
export interface PairedChatEvent {
    chatTitle: string;
    userPrompt: string;
    aiResponse?: string;
    affectedFiles: string[];
    status: TaskStatus;
    promptTimestamp: string;
    responseTimestamp?: string;
    itineraryId?: string;
    metadata: {
        promptEvent: any;
        responseEvent?: any;
    };
}

/**
 * Chat session for API response
 */
export interface ChatSession {
    chatTitle: string;
    userPrompt: string;
    aiResponse?: string;
    affectedFiles: string[];
    status: TaskStatus;
    promptTimestamp: string;
    responseTimestamp?: string;
    latestTimestamp: string;
    itineraryId?: string;
}

