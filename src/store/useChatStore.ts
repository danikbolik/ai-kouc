import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ChatMessage } from '@/types/chat';

export const CHAT_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  sender: 'assistant',
  text: 'Ahoj! Jsem tvůj **metodický AI konzultant**. Mohu vysvětlit logiku tréninkového plánu, vyhodnotit tvou zátěž, nebo navrhnout úpravy podle metodiky.\n\nNa co se chceš zeptat?',
  timestamp: new Date().toISOString(),
};

interface ChatState {
  messages: ChatMessage[];
  setMessages: (
    updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
  ) => void;
  resetChat: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [CHAT_WELCOME_MESSAGE],
      setMessages: (updater) =>
        set((state) => ({
          messages: typeof updater === 'function' ? updater(state.messages) : updater,
        })),
      resetChat: () => set({ messages: [CHAT_WELCOME_MESSAGE] }),
    }),
    {
      name: 'ai-coach-chat-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        messages: state.messages.filter((m) => !m.isStreaming),
      }),
    },
  ),
);
