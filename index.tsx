/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, Chat, GenerateContentResponse} from '@google/genai';
import * as marked from 'marked';

// --- Single User Authentication ---
const SESSION_KEY = 'gemini-chat-session';
const USER_PROFILE_KEY = 'gemini-user-profile';
type UserProfile = { name: string; email: string; password: string; };

// --- Types and Constants ---
const CHAT_INDEX_KEY = 'gemini-chat-index';
const CHAT_DATA_PREFIX = 'gemini-chat-';
const SIDEBAR_COLLAPSED_KEY = 'gemini-sidebar-collapsed';
const THEME_KEY = 'gemini-theme';
type Model = 'gemini' | 'deepseek';

type MessageStats = { tokenCount: number; speed: number; };
type FileData = { data: string; mimeType: string; };
type ChatMessage = {
  sender: 'user' | 'model';
  content: string;
  timestamp: string;
  stats?: MessageStats;
  file?: FileData;
  groundingSources?: any[];
};
type ChatIndexItem = { id: string; title: string; pinned?: boolean; archived?: boolean; };
type ChatIndex = ChatIndexItem[];
type ChatSettings = { systemInstruction?: string; temperature?: number; model?: Model };
type StoredChat = { settings: ChatSettings; messages: ChatMessage[]; };
type Theme = 'light' | 'dark' | 'system';

// --- Auth DOM Elements ---
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const authError = document.getElementById('auth-error') as HTMLElement;
const rememberMeCheckbox = document.getElementById('remember-me') as HTMLInputElement;

// --- App DOM Elements ---
const appContainer = document.getElementById('app-container') as HTMLElement;
const chatHistory = document.getElementById('chat-history') as HTMLElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendButton = chatForm.querySelector('button[type="submit"]') as HTMLButtonElement;
const micButton = document.getElementById('mic-button') as HTMLButtonElement;
const sidebarToggleButton = document.getElementById('sidebar-toggle-button') as HTMLButtonElement;
const fileUploadButton = document.getElementById('file-upload-button') as HTMLButtonElement;
const fileUploadInput = document.getElementById('file-upload-input') as HTMLInputElement;
const filePreviewContainer = document.getElementById('file-preview-container') as HTMLElement;
const newChatButton = document.getElementById('new-chat-button') as HTMLButtonElement;
const conversationList = document.getElementById('conversation-list') as HTMLElement;
const settingsButton = document.getElementById('settings-button') as HTMLButtonElement;
const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement;
const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
const closeSettingsButton = document.getElementById('close-settings-button') as HTMLButtonElement;
const modelSelector = document.getElementById('model-selector') as HTMLSelectElement;
const systemPromptInput = document.getElementById('system-prompt') as HTMLTextAreaElement;
const temperatureSlider = document.getElementById('temperature-slider') as HTMLInputElement;
const temperatureValue = document.getElementById('temperature-value') as HTMLSpanElement;
const themeSelector = document.getElementById('theme-selector') as HTMLSelectElement;
const exportChatButton = document.getElementById('export-chat-button') as HTMLButtonElement;
const searchToggle = document.getElementById('search-toggle') as HTMLInputElement;
const searchToggleButton = document.getElementById('search-toggle-button') as HTMLButtonElement;
const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
const userDisplayNameSpan = document.getElementById('user-display-name') as HTMLSpanElement;
const profileSettingsButton = document.getElementById('profile-settings-button') as HTMLButtonElement;
const profileSettingsDialog = document.getElementById('profile-settings-dialog') as HTMLDialogElement;
const profileSettingsForm = document.getElementById('profile-settings-form') as HTMLFormElement;
const closeProfileSettingsButton = document.getElementById('close-profile-settings-button') as HTMLButtonElement;
const profileNameInput = document.getElementById('profile-name') as HTMLInputElement;
const profileEmailInput = document.getElementById('profile-email') as HTMLInputElement;
const profilePasswordInput = document.getElementById('profile-password') as HTMLInputElement;


// --- Global State ---
let ai: GoogleGenAI;
let chat: Chat;
let chatHistoryArray: ChatMessage[] = [];
let currentSettings: ChatSettings = {};
let isGenerating = false;
let stopGeneration = false;
let attachedFile: FileData | null = null;
let chatIndex: ChatIndex = [];
let activeChatId: string | null = null;
let currentUserProfile: UserProfile;
const sendButtonIcon = sendButton.innerHTML; // Save original icon
const stopIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="currentColor" class="stop-icon"><rect x="6" y="6" width="12" height="12"></rect></svg>`;

// --- Helper Functions ---
const scrollToBottom = () => chatHistory.scrollTop = chatHistory.scrollHeight;

function setFormState(generating: boolean) {
  isGenerating = generating;
  chatInput.disabled = generating;
  micButton.disabled = generating;
  fileUploadButton.disabled = generating;
  sendButton.innerHTML = generating ? stopIcon : sendButtonIcon;
  sendButton.setAttribute('aria-label', generating ? 'Stop generating' : 'Send message');
  sendButton.classList.toggle('stop-button', generating);
}

// --- Dynamic Button Creators ---
function createActionButton(icon: string, label: string, onClick?: (e: MouseEvent) => void, className?: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.innerHTML = icon;
    button.setAttribute('aria-label', label);
    if (className) button.className = className;
    if (onClick) button.addEventListener('click', onClick);
    return button;
}

// --- Message Rendering ---
function appendMessage(msg: ChatMessage, index: number): { wrapper: HTMLElement, contentEl: HTMLElement } {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${msg.sender}-wrapper`;
    wrapper.dataset.messageIndex = index.toString();

    const messageEl = document.createElement('div');
    messageEl.className = `message ${msg.sender}-message`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'message-actions';

    if (msg.sender === 'model') {
        const copyIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        actionsWrapper.appendChild(createActionButton(copyIcon, 'Copy message', (e) => handleCopyMessage(e, msg.content)));
        
        const ttsIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        actionsWrapper.appendChild(createActionButton(ttsIcon, 'Read aloud', () => handleTTS(msg.content)));
        
        const thumbUpIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`;
        actionsWrapper.appendChild(createActionButton(thumbUpIcon, 'Good response', (e) => handleFeedback(e, 'up')));
        
        const thumbDownIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v-5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`;
        actionsWrapper.appendChild(createActionButton(thumbDownIcon, 'Bad response', (e) => handleFeedback(e, 'down')));

        if (index === chatHistoryArray.length - 1) {
            const regenerateIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
            actionsWrapper.appendChild(createActionButton(regenerateIcon, 'Regenerate response', handleRegenerate, 'regenerate-button'));
        }
    } else { // User message
        if (index === chatHistoryArray.length - 2) { // Only allow editing the last user message
            const editIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
            actionsWrapper.appendChild(createActionButton(editIcon, 'Edit message', () => handleEdit(wrapper, index)));
        }
    }
    contentEl.appendChild(actionsWrapper);

    if (msg.file) {
        const img = document.createElement('img');
        img.src = msg.file.data;
        img.alt = 'User uploaded image';
        contentEl.appendChild(img);
    }
    
    const textContainer = document.createElement('div');
    textContainer.className = 'message-text-container';
    if (msg.sender === 'user') {
        textContainer.textContent = msg.content;
    } else {
        textContainer.innerHTML = marked.parse(msg.content) as string;
    }
    contentEl.appendChild(textContainer);
    messageEl.appendChild(contentEl);

    if (msg.groundingSources && msg.groundingSources.length > 0) {
        const sourcesEl = document.createElement('div');
        sourcesEl.className = 'grounding-sources';
        sourcesEl.innerHTML = `<h4>Sources:</h4><ol>${msg.groundingSources.map(s => `<li><a href="${s.uri}" target="_blank">${s.title}</a></li>`).join('')}</ol>`;
        messageEl.appendChild(sourcesEl);
    }
    appendMessageFooter(messageEl, msg.timestamp, msg.stats);

    wrapper.appendChild(messageEl);
    chatHistory.appendChild(wrapper);

    // Truncate long messages
    if (msg.sender === 'model') {
        const MAX_HEIGHT = 400; // pixels
        if (textContainer.scrollHeight > MAX_HEIGHT) {
            textContainer.classList.add('truncated');
            textContainer.style.maxHeight = `${MAX_HEIGHT}px`;
            const showMore = createActionButton('Show more...', 'Expand message', () => {
                textContainer.classList.remove('truncated');
                textContainer.style.maxHeight = '';
                showMore.remove();
            }, 'show-more-button');
            messageEl.appendChild(showMore);
        }
    }
    
    scrollToBottom();
    return { wrapper, contentEl };
}

function appendMessageFooter(messageEl: HTMLElement, timestamp: string, stats?: MessageStats) {
    const footerEl = document.createElement('div');
    footerEl.className = 'message-footer';
    if (stats?.tokenCount) footerEl.innerHTML += `<div class="message-stats">${stats.tokenCount} tokens · ${Math.round(stats.speed)} tokens/s</div>`;
    footerEl.innerHTML += `<div class="message-timestamp">${new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>`;
    messageEl.appendChild(footerEl);
}

// --- Feature Logic: Copy, TTS, Feedback, Edit, Regenerate ---
function handleCopyMessage(e: Event, text: string) {
    const button = (e.currentTarget as HTMLButtonElement);
    navigator.clipboard.writeText(text).then(() => {
        const originalIcon = button.innerHTML;
        const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        button.innerHTML = checkIcon;
        setTimeout(() => button.innerHTML = originalIcon, 2000);
    });
}

function handleTTS(text: string) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
}

function handleFeedback(e: MouseEvent, type: 'up' | 'down') {
    const button = (e.currentTarget as HTMLButtonElement);
    const wrapper = button.closest('.message-actions');
    wrapper?.querySelectorAll('.feedback-active').forEach(b => b.classList.remove('feedback-active'));
    button.classList.add('feedback-active');
}


function handleRegenerate() {
    if (isGenerating || chatHistoryArray.length < 2) return;
    const lastUserMessage = chatHistoryArray[chatHistoryArray.length - 2];
    chatHistoryArray.splice(chatHistoryArray.length - 1, 1); // Remove last model response
    saveCurrentChat();
    renderHistory();
    sendMessage(lastUserMessage.content, lastUserMessage.file);
}

function handleEdit(wrapper: HTMLElement, index: number) {
    const message = chatHistoryArray[index];
    const textContainer = wrapper.querySelector('.message-text-container') as HTMLElement;
    const originalText = message.content;
    textContainer.innerHTML = '';
    
    const editInput = document.createElement('textarea');
    editInput.value = originalText;
    editInput.rows = 3;
    editInput.className = 'edit-textarea';

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.className = 'edit-save';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'edit-cancel';

    const restoreOriginal = () => {
        textContainer.innerHTML = '';
        textContainer.textContent = originalText;
    };
    
    cancelButton.onclick = restoreOriginal;
    saveButton.onclick = () => {
        const newText = editInput.value.trim();
        if (newText && newText !== originalText) {
            chatHistoryArray[index].content = newText;
            chatHistoryArray.splice(index + 1); // Truncate history after this message
            saveCurrentChat();
            renderHistory();
            sendMessage(newText, message.file);
        } else {
            restoreOriginal();
        }
    };

    textContainer.appendChild(editInput);
    textContainer.appendChild(saveButton);
    textContainer.appendChild(cancelButton);
    editInput.focus();
}

// --- Local Storage Data Functions ---
function getChatIndex(): ChatIndex {
    const index = localStorage.getItem(CHAT_INDEX_KEY);
    return index ? JSON.parse(index) : [];
}

function saveChatIndex() {
    localStorage.setItem(CHAT_INDEX_KEY, JSON.stringify(chatIndex));
}

function getStoredChat(chatId: string): StoredChat | null {
    const chat = localStorage.getItem(`${CHAT_DATA_PREFIX}${chatId}`);
    return chat ? JSON.parse(chat) : null;
}

function saveCurrentChat() {
    if (!activeChatId) return;
    const chatData: StoredChat = {
        settings: currentSettings,
        messages: chatHistoryArray,
    };
    localStorage.setItem(`${CHAT_DATA_PREFIX}${activeChatId}`, JSON.stringify(chatData));
}

function updateChatMetadata(chatId: string, data: Partial<Omit<ChatIndexItem, 'id'>>) {
    const indexItem = chatIndex.find(c => c.id === chatId);
    if (indexItem) {
        Object.assign(indexItem, data);
        saveChatIndex();
    }
}

// --- Sidebar and Chat Management ---
function renderSidebar() {
    conversationList.innerHTML = '';

    // Separate chats into active and archived
    const activeChats = chatIndex.filter(c => !c.archived);
    const archivedChats = chatIndex.filter(c => c.archived);

    // Sort and render active chats
    activeChats.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.id.localeCompare(a.id));
    
    activeChats.forEach(item => {
        conversationList.appendChild(createConversationItem(item));
    });

    // Render archived chats in a collapsible section
    if (archivedChats.length > 0) {
        const archiveSection = document.createElement('div');
        archiveSection.className = 'archive-section';

        const header = document.createElement('div');
        header.className = 'archive-header';
        header.textContent = `Archived (${archivedChats.length})`;
        header.onclick = () => archiveSection.classList.toggle('collapsed');
        
        const container = document.createElement('div');
        container.className = 'archived-chats-container';
        
        archivedChats.sort((a, b) => b.id.localeCompare(a.id));
        archivedChats.forEach(item => {
            container.appendChild(createConversationItem(item));
        });

        archiveSection.appendChild(header);
        archiveSection.appendChild(container);
        conversationList.appendChild(archiveSection);
    }
}

function createConversationItem(item: ChatIndexItem): HTMLElement {
    const div = document.createElement('div');
    div.className = `conversation-item ${item.id === activeChatId ? 'active' : ''} ${item.archived ? 'archived' : ''}`;
    div.dataset.chatId = item.id;
    div.addEventListener('click', () => {
        if (item.archived) {
            toggleArchive(item.id);
        }
        loadChat(item.id);
    });

    const titleInput = document.createElement('input');
    titleInput.value = item.title;
    titleInput.className = 'conversation-item-title';
    titleInput.readOnly = true;
    
    titleInput.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        titleInput.readOnly = false;
        titleInput.select();
    });
    titleInput.addEventListener('blur', () => {
        titleInput.readOnly = true;
        updateChatMetadata(item.id, { title: titleInput.value });
    });
    titleInput.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter') titleInput.blur(); 
    });
    
    const actions = document.createElement('div');
    actions.className = 'action-buttons';

    if (item.archived) {
        const unarchiveIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>`;
        actions.appendChild(createActionButton(unarchiveIcon, 'Unarchive chat', e => { e.stopPropagation(); toggleArchive(item.id); }, 'action-button'));
    } else {
        const pinIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${item.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
        const pinBtn = createActionButton(pinIcon, 'Pin chat', e => { e.stopPropagation(); togglePin(item.id); }, 'action-button pin-button');
        if (item.pinned) pinBtn.classList.add('pinned');
        actions.appendChild(pinBtn);

        const archiveIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>`;
        actions.appendChild(createActionButton(archiveIcon, 'Archive chat', e => { e.stopPropagation(); toggleArchive(item.id); }, 'action-button'));
    }
    
    const deleteIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    actions.appendChild(createActionButton(deleteIcon, 'Delete chat', e => { e.stopPropagation(); deleteChat(item.id); }, 'action-button'));

    div.appendChild(titleInput);
    div.appendChild(actions);
    return div;
}


function loadChat(chatId: string) {
    if (activeChatId === chatId) return;
    activeChatId = chatId;
    const storedChat = getStoredChat(chatId);
    if (storedChat) {
      chatHistoryArray = storedChat.messages;
      currentSettings = storedChat.settings;
    }
    
    if ((currentSettings.model || 'gemini') === 'gemini') {
        chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            history: chatHistoryArray.map(msg => ({
                role: msg.sender,
                parts: [{ text: msg.content }]
            })),
            config: {
                systemInstruction: currentSettings.systemInstruction,
                temperature: currentSettings.temperature
            }
        });
    }

    renderHistory();
    renderSidebar();
    loadSettingsIntoForm();
}

function startNewChat() {
    activeChatId = null;
    chatHistoryArray = [];
    currentSettings = { temperature: 0.9, model: 'gemini' }; // Default settings
    chat = ai.chats.create({ model: 'gemini-2.5-flash', config: { temperature: 0.9 } });
    renderHistory();
    // Don't re-render sidebar, just de-select active item
    conversationList.querySelector('.active')?.classList.remove('active');
    loadSettingsIntoForm();
    chatInput.focus();
}

function deleteChat(chatId: string) {
    if (confirm('Delete this chat forever?')) {
        localStorage.removeItem(`${CHAT_DATA_PREFIX}${chatId}`);
        chatIndex = chatIndex.filter(c => c.id !== chatId);
        saveChatIndex();

        if (activeChatId === chatId) {
            const nextChat = chatIndex.find(c => !c.archived);
            if (nextChat) {
              loadChat(nextChat.id);
            } else {
              startNewChat();
            }
        }
        renderSidebar();
    }
}

function togglePin(chatId: string) {
    const item = chatIndex.find(c => c.id === chatId);
    if (item) {
        item.pinned = !item.pinned;
        updateChatMetadata(chatId, { pinned: item.pinned });
    }
    renderSidebar();
}

function toggleArchive(chatId: string) {
    const item = chatIndex.find(c => c.id === chatId);
    if (item) {
        item.archived = !item.archived;
        if (item.archived) {
            item.pinned = false; // Unpin when archiving
        }
        updateChatMetadata(chatId, { archived: item.archived, pinned: item.pinned });
        
        // If the active chat is archived, load the next available active chat
        if (item.archived && activeChatId === chatId) {
            const nextChat = chatIndex.find(c => !c.archived);
            if (nextChat) {
                loadChat(nextChat.id);
            } else {
                startNewChat();
            }
        }
    }
    renderSidebar();
}

// --- History and Core Rendering ---
function renderHistory() {
    chatHistory.innerHTML = '';
    if (chatHistoryArray.length) {
        chatHistoryArray.forEach((msg, i) => appendMessage(msg, i));
    } else {
        appendMessage({ sender: 'model', content: 'Hello! How can I help you today?', timestamp: new Date().toISOString() }, 0);
    }
    scrollToBottom();
}

// --- Core API Interaction ---
async function sendMessage(userMessage: string, file?: FileData | null) {
    if ((currentSettings.model || 'gemini') === 'deepseek') {
        await sendMessageWithDeepSeek(userMessage, file);
    } else {
        await sendMessageWithGemini(userMessage, file);
    }
}

async function sendMessageWithGemini(userMessage: string, file?: FileData | null) {
    setFormState(true);
    const modelMessageWrapper = document.createElement('div');
    modelMessageWrapper.className = 'message-wrapper model-wrapper';
    modelMessageWrapper.innerHTML = `<div class="message model-message"><div class="loading-indicator"><div></div><div></div><div></div></div></div>`;
    chatHistory.appendChild(modelMessageWrapper);
    scrollToBottom();

    try {
      const startTime = performance.now();
      const messagePayload: any = { message: [] };
      if (file) messagePayload.message.push({ inlineData: { data: file.data.split(',')[1], mimeType: file.mimeType } });
      if (userMessage) messagePayload.message.push({ text: userMessage });
      if (searchToggle.checked) messagePayload.tools = [{googleSearch: {}}];

      const result = await chat.sendMessageStream(messagePayload);
      let fullResponse = '', isFirstChunk = true, lastChunk: GenerateContentResponse | null = null, groundingSources: any[] = [];
      const cursor = document.createElement('span');
      cursor.className = 'blinking-cursor';

      for await (const chunk of result) {
        if (stopGeneration) break;
        if (isFirstChunk) {
            modelMessageWrapper.innerHTML = `<div class="message model-message"><div class="message-content"></div></div>`;
            isFirstChunk = false;
        }
        fullResponse += chunk.text;
        lastChunk = chunk;
        if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            groundingSources.push(...chunk.candidates[0].groundingMetadata.groundingChunks);
        }
        const modelContentEl = modelMessageWrapper.querySelector('.message-content')!;
        modelContentEl.innerHTML = await marked.parse(fullResponse);
        modelContentEl.appendChild(cursor);
        scrollToBottom();
      }
      cursor.remove();
      
      const endTime = performance.now();
      const tokenCount = lastChunk?.usageMetadata?.totalTokenCount ?? 0;
      const speed = tokenCount / ((endTime - startTime) / 1000);
      const stats: MessageStats = { tokenCount, speed };
      const modelTimestamp = new Date().toISOString();
      const uniqueSources = Array.from(new Map(groundingSources.map(item => [item.uri, item])).values());
      
      const modelMessageForHistory: ChatMessage = { sender: 'model', content: fullResponse, timestamp: modelTimestamp, stats, groundingSources: uniqueSources };
      chatHistoryArray.push(modelMessageForHistory);
      saveCurrentChat();
      
      modelMessageWrapper.remove();
      appendMessage(modelMessageForHistory, chatHistoryArray.length - 1);

    } catch (error) {
      console.error('Error sending message:', error);
      modelMessageWrapper.innerHTML = `<div class="message model-message error">Sorry, something went wrong. Please check the console.</div>`;
    } finally {
      stopGeneration = false;
      setFormState(false);
      chatInput.focus();
      renderHistory(); // Re-render to update action buttons
    }
}

async function sendMessageWithDeepSeek(userMessage: string, file?: FileData | null) {
    if (file) {
        alert("The DeepSeek model in this demo does not support file uploads.");
        clearAttachedFile();
        return;
    }
    setFormState(true);
    const modelMessageWrapper = document.createElement('div');
    modelMessageWrapper.className = 'message-wrapper model-wrapper';
    modelMessageWrapper.innerHTML = `<div class="message model-message"><div class="loading-indicator"><div></div><div></div><div></div></div></div>`;
    chatHistory.appendChild(modelMessageWrapper);
    scrollToBottom();

    try {
        const history = chatHistoryArray.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));
        
        const response = await fetch('/api/deepseek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullResponse = '', isFirstChunk = true;
        const cursor = document.createElement('span');
        cursor.className = 'blinking-cursor';

        while(!stopGeneration) {
            const { done, value } = await reader.read();
            if (done) break;

            if (isFirstChunk) {
                modelMessageWrapper.innerHTML = `<div class="message model-message"><div class="message-content"></div></div>`;
                isFirstChunk = false;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonString = line.substring(6).trim();
                    if (jsonString === '[DONE]') {
                        stopGeneration = true;
                        break;
                    }
                    try {
                        const chunkData = JSON.parse(jsonString);
                        const textChunk = chunkData.choices[0]?.delta?.content || '';
                        fullResponse += textChunk;
                    } catch (e) {
                        console.error("Failed to parse stream chunk:", jsonString);
                    }
                }
            }
            
            const modelContentEl = modelMessageWrapper.querySelector('.message-content')!;
            modelContentEl.innerHTML = await marked.parse(fullResponse);
            modelContentEl.appendChild(cursor);
            scrollToBottom();
        }
        cursor.remove();
      
        const modelTimestamp = new Date().toISOString();
        const modelMessageForHistory: ChatMessage = { sender: 'model', content: fullResponse, timestamp: modelTimestamp };
        chatHistoryArray.push(modelMessageForHistory);
        saveCurrentChat();
      
        modelMessageWrapper.remove();
        appendMessage(modelMessageForHistory, chatHistoryArray.length - 1);

    } catch (error) {
      console.error('Error sending message to DeepSeek:', error);
      modelMessageWrapper.innerHTML = `<div class="message model-message error">Sorry, something went wrong with the DeepSeek model. Please check the console.</div>`;
    } finally {
      stopGeneration = false;
      setFormState(false);
      chatInput.focus();
      renderHistory();
    }
}

async function handleFormSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (isGenerating) { stopGeneration = true; return; }
    if (isRecording) { recognition?.stop(); return; }

    const userMessage = chatInput.value.trim();
    if (!userMessage && !attachedFile) return;
    
    if (!activeChatId) {
        activeChatId = `chat_${Date.now()}`;
        const title = userMessage.substring(0, 30) || 'New Chat';
        const newIndexItem = { id: activeChatId, title, pinned: false, archived: false };
        chatIndex.unshift(newIndexItem);
        saveChatIndex();
        renderSidebar();
        // Activate the new chat
        conversationList.querySelector('.active')?.classList.remove('active');
        conversationList.querySelector(`[data-chat-id="${activeChatId}"]`)?.classList.add('active');
    }

    const userTimestamp = new Date().toISOString();
    const userMessageForHistory: ChatMessage = {
      sender: 'user', content: userMessage, timestamp: userTimestamp, file: attachedFile || undefined
    };
    chatHistoryArray.push(userMessageForHistory);
    // Don't save yet, save after model response
    appendMessage(userMessageForHistory, chatHistoryArray.length - 1);


    await sendMessage(userMessage, attachedFile);
    
    chatInput.value = '';
    clearAttachedFile();
    autoSizeTextarea();
}

// --- Settings and Theme ---
function applyTheme(theme: Theme) {
    if (theme === 'system') document.body.removeAttribute('data-theme');
    else document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    themeSelector.value = theme;
}

function loadSettingsIntoForm() {
    systemPromptInput.value = currentSettings.systemInstruction || '';
    temperatureSlider.value = (currentSettings.temperature ?? 0.9).toString();
    temperatureValue.textContent = temperatureSlider.value;
    modelSelector.value = currentSettings.model || 'gemini';
}

function handleSettingsSave(e: Event) {
    e.preventDefault();
    currentSettings.systemInstruction = systemPromptInput.value;
    currentSettings.temperature = parseFloat(temperatureSlider.value);
    currentSettings.model = modelSelector.value as Model;
    applyTheme(themeSelector.value as Theme);
    settingsDialog.close();

    if (activeChatId) {
        saveCurrentChat();
        loadChat(activeChatId); // Reload chat with new settings
    }
}

// --- File Handling ---
const clearAttachedFile = () => { attachedFile = null; fileUploadInput.value = ''; filePreviewContainer.innerHTML = ''; };
const handleFileSelect = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) { clearAttachedFile(); return; }
    const reader = new FileReader();
    reader.onload = e => {
        attachedFile = { data: e.target?.result as string, mimeType: file.type };
        filePreviewContainer.innerHTML = `<div class="file-preview-item"><img src="${attachedFile.data}" alt="Preview"><button class="file-preview-remove" onclick="(${clearAttachedFile.toString()})()">&times;</button></div>`;
    };
    reader.readAsDataURL(file);
};

// --- Input and Speech Recognition ---
const autoSizeTextarea = () => { chatInput.style.height = 'auto'; chatInput.style.height = chatInput.scrollHeight + 'px'; };
const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: any | null = null, isRecording = false, manualStop = false;
if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onstart = () => { isRecording = true; manualStop = false; chatForm.classList.add('is-recording'); micButton.classList.add('recording'); chatInput.placeholder = 'Listening...'; };
  recognition.onend = () => { isRecording = false; chatForm.classList.remove('is-recording'); micButton.classList.remove('recording'); chatInput.placeholder = 'Ask me anything...'; if (!manualStop && (chatInput.value.trim() || attachedFile)) chatForm.requestSubmit(); };
  recognition.onresult = (event: any) => { chatInput.value = Array.from(event.results).map((r: any) => r[0].transcript).join(''); autoSizeTextarea(); };
} else { micButton.style.display = 'none'; }


// --- Export Chat ---
function exportChat() {
    if (!activeChatId) return;
    const title = chatIndex.find(c => c.id === activeChatId)?.title || 'chat-export';
    let markdown = `# ${title}\n\n`;
    chatHistoryArray.forEach(msg => {
        markdown += `**${msg.sender.toUpperCase()}** (${new Date(msg.timestamp).toLocaleString()}):\n\n`;
        if (msg.file) markdown += `![Uploaded Image]\n\n`;
        markdown += `${msg.content}\n\n---\n\n`;
    });
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/ /g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

// --- Custom Marked Renderer ---
function jsonToHtmlTree(json: any): string {
    if (typeof json !== 'object' || json === null) {
        const type = typeof json;
        return `<span class="json-value-${type}">${JSON.stringify(json)}</span>`;
    }
    const isArray = Array.isArray(json);
    let html = `<details class="json-tree" ${isArray ? '' : 'open'}><summary>${isArray ? '[' : '{'}</summary><div class="json-content">`;
    const keys = Object.keys(json);
    html += keys.map(key => {
        const value = (json as any)[key];
        const keyHtml = isArray ? '' : `<span class="json-key">"${key}"</span>: `;
        return `<div>${keyHtml}${jsonToHtmlTree(value)}</div>`;
    }).join('');
    html += `</div>${isArray ? ']' : '}'}</details>`;
    return html;
}

const renderer = {
    code({ text: code, lang }: { text: string; lang?: string }) {
        const language = lang || 'text';
        const copyIcon = `<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1Z"/></svg>`;
        
        if (language === 'json') {
            try {
                return `<div class="json-container">${jsonToHtmlTree(JSON.parse(code))}</div>`;
            } catch (e) { /* fallback to plain text if JSON is invalid */ }
        }
        
        const sanitizedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return `
            <div class="code-block-wrapper">
              <div class="code-block-header">
                <span>${language}</span>
                <button class="copy-code-button" aria-label="Copy code">${copyIcon}</button>
              </div>
              <pre><code class="language-${language}">${sanitizedCode}</code></pre>
            </div>`;
    },
    table(token: { header: any[], rows: any[] }) {
        const parser = (this as any).parser;
        let header = '';
        if (token.header.length) {
            header += '<thead><tr>';
            for (const cell of token.header) {
                header += `<th>${parser.parse(cell.tokens)}</th>`;
            }
            header += '</tr></thead>';
        }
        let body = '<tbody>';
        for (const row of token.rows) {
            body += '<tr>';
            for (const cell of row) {
                body += `<td>${parser.parse(cell.tokens)}</td>`;
            }
            body += '</tr>';
        }
        body += '</tbody>';
        return `<div class="table-wrapper"><table>${header}${body}</table></div>`;
    }
};
marked.use({ renderer });


// --- Main App Initialization ---
function initializeAppForUser() {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true') {
      appContainer.classList.add('sidebar-collapsed');
    }
    applyTheme((localStorage.getItem(THEME_KEY) as Theme) || 'system');
    userDisplayNameSpan.textContent = currentUserProfile.name;
    
    chatIndex = getChatIndex();
    renderSidebar();

    const firstActiveChat = chatIndex.find(c => !c.archived);
    if (firstActiveChat) {
        loadChat(firstActiveChat.id);
    } else {
        startNewChat();
    }
    
    setFormState(false);
    chatInput.focus();
}

// --- Authentication Logic ---
function loadUserProfile() {
    const storedProfile = localStorage.getItem(USER_PROFILE_KEY);
    if (storedProfile) {
        currentUserProfile = JSON.parse(storedProfile);
    } else {
        currentUserProfile = {
            name: 'Rommel',
            email: 'rommel@remoteit.solutions',
            password: 'Qazw0329!'
        };
        saveUserProfile();
    }
}

function saveUserProfile() {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(currentUserProfile));
}

function showAuthError(message: string) {
    authError.textContent = message;
    authError.classList.add('visible');
}

function clearAuthError() {
    authError.textContent = '';
    authError.classList.remove('visible');
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthError();
    const email = (loginForm.querySelector('#login-email') as HTMLInputElement).value;
    const password = (loginForm.querySelector('#login-password') as HTMLInputElement).value;
    const rememberMe = rememberMeCheckbox.checked;
    
    if (email === currentUserProfile.email && password === currentUserProfile.password) {
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem(SESSION_KEY, 'true');
        document.body.classList.remove('logged-out');
        document.body.classList.add('logged-in');
        initializeAppForUser();
    } else {
        showAuthError('Invalid email or password.');
    }
});

logoutButton.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
});

// --- Profile Settings Logic ---
function handleProfileSave(e: Event) {
    e.preventDefault();
    const newName = profileNameInput.value.trim();
    const newEmail = profileEmailInput.value.trim();
    const newPassword = profilePasswordInput.value.trim();

    if (newName) currentUserProfile.name = newName;
    if (newEmail) currentUserProfile.email = newEmail;
    if (newPassword) currentUserProfile.password = newPassword;

    saveUserProfile();
    userDisplayNameSpan.textContent = currentUserProfile.name;
    profileSettingsDialog.close();
    profilePasswordInput.value = ''; // Clear password field
    alert('Profile updated successfully!');
}

// --- App Startup ---
try {
  ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  loadUserProfile();

  // Event Listeners (App)
  chatForm.addEventListener('submit', handleFormSubmit);
  newChatButton.addEventListener('click', startNewChat);
  sidebarToggleButton.addEventListener('click', () => {
      appContainer.classList.toggle('sidebar-collapsed');
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, appContainer.classList.contains('sidebar-collapsed').toString());
  });
  searchToggleButton.addEventListener('click', () => {
    searchToggle.checked = !searchToggle.checked;
    searchToggleButton.classList.toggle('active', searchToggle.checked);
  });
  settingsButton.addEventListener('click', () => settingsDialog.showModal());
  closeSettingsButton.addEventListener('click', () => settingsDialog.close());
  settingsForm.addEventListener('submit', handleSettingsSave);
  profileSettingsButton.addEventListener('click', () => {
    profileNameInput.value = currentUserProfile.name;
    profileEmailInput.value = currentUserProfile.email;
    profilePasswordInput.value = '';
    profileSettingsDialog.showModal();
  });
  closeProfileSettingsButton.addEventListener('click', () => profileSettingsDialog.close());
  profileSettingsForm.addEventListener('submit', handleProfileSave);
  temperatureSlider.addEventListener('input', () => temperatureValue.textContent = temperatureSlider.value);
  exportChatButton.addEventListener('click', exportChat);
  themeSelector.addEventListener('change', () => applyTheme(themeSelector.value as Theme));
  fileUploadButton.addEventListener('click', () => fileUploadInput.click());
  fileUploadInput.addEventListener('change', handleFileSelect);
  chatInput.addEventListener('input', autoSizeTextarea);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatForm.requestSubmit(); } });
  micButton.addEventListener('click', () => { if (isRecording) { manualStop = true; recognition?.stop(); } else { recognition?.start(); } });
  
  chatHistory.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      const copyButton = target.closest('.copy-code-button');
      if (copyButton) {
          const code = copyButton.closest('.code-block-wrapper')?.querySelector('pre code')?.textContent;
          if (code) handleCopyMessage(e, code);
      }
  });

  // Central Auth State Check on Load
  if (localStorage.getItem(SESSION_KEY) === 'true' || sessionStorage.getItem(SESSION_KEY) === 'true') {
    document.body.classList.add('logged-in');
    document.body.classList.remove('logged-out');
    initializeAppForUser();
  } else {
    document.body.classList.add('logged-out');
    document.body.classList.remove('logged-in');
  }

} catch (error) {
  console.error('Initialization Error:', error);
  document.body.innerHTML = `<div style="padding: 2rem; text-align: center; color: red;"><strong>Fatal Error:</strong> Could not initialize. Check API key and refresh.</div>`;
}