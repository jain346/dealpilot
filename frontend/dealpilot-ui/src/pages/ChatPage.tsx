/* ================================================================
   CHAT PAGE
   ================================================================ */

import { useState, useEffect, useRef } from "react";
import type { Profile, Conversation, Message, Page, PendingChatAction, Research, FitResult, ResponsePayload } from "../types";
import { useToast } from "../context/ToastContext";
import { request, authHeaders, toastForError, responseText } from "../api/client";
import { storage } from "../api/client";
import { isProfileComplete, relativeTime } from "../utils/format";
import { AssistantMessage, TypingIndicator } from "../components";

const SUGGESTIONS = [
  "Find sponsors for my niche",
  "Research a trending brand",
  "Evaluate a partnership opportunity",
  "What deals should I pursue this week?",
];

export function ChatPage({
  profile,
  conversations,
  onRefresh,
  pendingAction,
  onClearPendingAction,
  onNavigate,
  globalBusyRef,
}: {
  profile: Profile;
  conversations: Conversation[];
  onRefresh: () => void;
  pendingAction?: PendingChatAction;
  onClearPendingAction?: () => void;
  onNavigate?: (page: Page, company?: string) => void;
  globalBusyRef?: React.MutableRefObject<boolean>;
}) {
  const toast = useToast();
  const [session, setSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [isFinishedThinking, setIsFinishedThinking] = useState(false);
  const busyRef = useRef(false);
  const pollingRef = useRef<number | null>(null);
  const [mobileRecentsOpen, setMobileRecentsOpen] = useState(false);
  const [statusLabel, setStatusLabel] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentActionRef = useRef<string | null>(null);

  const getBusyWarningMessage = () => {
    const action = currentActionRef.current;
    if (action === "opportunities") return "DealPilot is currently discovering opportunities. Please wait for it to finish before switching or starting a new conversation.";
    if (action === "research") return "Brand research is currently in progress. Please wait for it to complete before switching or starting a new conversation.";
    if (action === "fit") return "Fit evaluation is currently in progress. Please wait for it to complete before switching or starting a new conversation.";
    return "DealPilot is currently responding to your message. Please wait for it to finish before switching or starting a new conversation.";
  };

  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  };

  useEffect(() => { return () => stopPolling(); }, []);

  const setIsBusy = (val: boolean) => {
    busyRef.current = val;
    if (globalBusyRef) globalBusyRef.current = val;
    setBusy(val);
  };

  useEffect(() => {
    const handler = () => { toast.warning("A request is already in progress. Please wait for it to complete before starting another."); };
    window.addEventListener("dealpilot:busy-warning", handler);
    return () => window.removeEventListener("dealpilot:busy-warning", handler);
  }, []);

  const scrollToBottom = () => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; };
  useEffect(() => { scrollToBottom(); }, [messages, busy]);

  useEffect(() => {
    if (!pendingAction) return;
    if (busyRef.current) { toast.warning("A request is already in progress. Please wait for it to complete before starting another."); onClearPendingAction?.(); return; }
    const action = pendingAction;
    onClearPendingAction?.();

    const executePendingAction = async () => {
      if (!isProfileComplete(profile)) { toast.warning("Please complete and save your creator profile before starting a conversation."); onNavigate?.("profile"); return; }
      setIsBusy(true);
      currentActionRef.current = action.type;
      setMessages([]);
      const actionLabel = action.type === "research" ? `Researching ${action.companyName}…` : `Evaluating fit for ${action.companyName}…`;
      setStatusLabel(actionLabel);

      try {
        const created = await request<{ session_id: string }>("/agent/sessions", { method: "POST", headers: authHeaders() });
        const activeSessionId = created.session_id;
        setSession(activeSessionId);
        localStorage.setItem(storage.session, activeSessionId);

        const userPrompt = action.type === "research" ? `Research brand: ${action.companyName}` : `Evaluate fit for brand: ${action.companyName}`;
        setMessages([{ role: "user", content: userPrompt, created_at: new Date().toISOString() }]);

        await request(`/agent/sessions/${encodeURIComponent(activeSessionId)}/custom_message`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ role: "user", content: userPrompt }) }).catch(() => {});

        let assistantContent = "";
        if (action.type === "research" && action.opportunityId) {
          setStatusLabel(`Researching ${action.companyName} — gathering brand signals…`);
          const res = await request<Research>(`/agent/opportunities/${action.opportunityId}/research?session_id=${encodeURIComponent(activeSessionId)}`, { method: "POST", headers: authHeaders() });
          assistantContent = `### ◌ Brand Intelligence Research: ${res.company_name}\n\n**Executive Summary:** ${res.summary || "Brand research job completed successfully."}\n\n**Products & Offerings:** ${(res.products || []).join(", ") || "N/A"}\n**Target Markets:** ${(res.target_markets || []).join(", ") || "N/A"}\n**Partnership Signals:** ${(res.creator_partnership_signals || []).join("; ") || "N/A"}\n\n🔗 [View full Research Page for ${res.company_name}](#research/${encodeURIComponent(res.company_name)})`;
        } else if (action.type === "fit" && action.opportunityId) {
          setStatusLabel(`Evaluating brand fit for ${action.companyName}…`);
          const res = await request<FitResult>(`/agent/opportunities/${action.opportunityId}/fit?session_id=${encodeURIComponent(activeSessionId)}`, { method: "POST", headers: authHeaders() });
          assistantContent = `### ◒ Creator-Brand Fit Analysis: ${res.company_name}\n\n**Overall Fit Score:** ${Math.round(res.overall_score)}%\n**Recommendation:** ${res.recommendation}\n\n**Reasoning:** ${res.reasoning}\n\n**Key Strengths:** ${(res.strengths || []).join(", ") || "N/A"}\n\n🔗 [View full Fit Analysis Page for ${res.company_name}](#fit/${encodeURIComponent(res.company_name)})`;
        } else if (action.type === "fit" && action.researchId) {
          setStatusLabel(`Evaluating brand fit for ${action.companyName}…`);
          const res = await request<FitResult>(`/agent/research/${action.researchId}/fit?session_id=${encodeURIComponent(activeSessionId)}`, { method: "POST", headers: authHeaders() });
          assistantContent = `### ◒ Creator-Brand Fit Analysis: ${res.company_name}\n\n**Overall Fit Score:** ${Math.round(res.overall_score)}%\n**Recommendation:** ${res.recommendation}\n\n**Reasoning:** ${res.reasoning}\n\n**Key Strengths:** ${(res.strengths || []).join(", ") || "N/A"}\n\n🔗 [View full Fit Analysis Page for ${res.company_name}](#fit/${encodeURIComponent(res.company_name)})`;
        }

        if (assistantContent) {
          setIsFinishedThinking(true);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          setMessages((current) => [...current, { role: "assistant", content: assistantContent, created_at: new Date().toISOString() }]);
          await request(`/agent/sessions/${encodeURIComponent(activeSessionId)}/custom_message`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ role: "assistant", content: assistantContent }) }).catch(() => {});
          setSessionTitles((prev) => ({ ...prev, [activeSessionId]: userPrompt }));
          onRefresh();
        }
      } catch (err) {
        toastForError(toast, err, `${action.type === "research" ? "Research" : "Fit evaluation"} failed`);
      } finally {
        setIsFinishedThinking(false);
        setIsBusy(false);
        setStatusLabel("");
      }
    };

    void executePendingAction();
  }, [pendingAction]);

  const startPollingForReply = (sessionId: string) => {
    stopPolling();
    let attempts = 0;
    pollingRef.current = window.setInterval(async () => {
      attempts++;
      if (attempts > 80) { stopPolling(); setIsBusy(false); return; }
      try {
        const latestMsgs = await request<Message[]>(`/agent/sessions/${encodeURIComponent(sessionId)}/messages`, { headers: authHeaders() });
        if (latestMsgs.length > 0 && latestMsgs[latestMsgs.length - 1].role === "assistant") {
          stopPolling();
          setIsFinishedThinking(true);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          setMessages(latestMsgs);
          setIsFinishedThinking(false);
          setIsBusy(false);
          setStatusLabel("");
          onRefresh();
        }
      } catch { /* Polling retry on next tick */ }
    }, 2500);
  };

  const loadMessages = async (id: string | null) => {
    stopPolling();
    if (!id) { setMessages([]); return; }
    try {
      const msgs = await request<Message[]>(`/agent/sessions/${encodeURIComponent(id)}/messages`, { headers: authHeaders() });
      setMessages(msgs);
      const firstUserMsg = msgs.find((m) => m.role === "user");
      if (firstUserMsg && firstUserMsg.content) setSessionTitles((prev) => ({ ...prev, [id]: firstUserMsg.content }));
      if (msgs.length > 0 && msgs[msgs.length - 1].role === "user") { setIsBusy(true); setStatusLabel(""); startPollingForReply(id); }
    } catch { localStorage.removeItem(storage.session); setSession(null); }
  };

  useEffect(() => {
    if (!conversations || conversations.length === 0) return;
    const unmapped = conversations.filter((c) => !sessionTitles[c.session_id]);
    if (unmapped.length === 0) return;
    void (async () => {
      for (const conv of unmapped) {
        try {
          const msgs = await request<Message[]>(`/agent/sessions/${encodeURIComponent(conv.session_id)}/messages`, { headers: authHeaders() });
          const firstUserMsg = msgs.find((m) => m.role === "user");
          if (firstUserMsg && firstUserMsg.content) setSessionTitles((prev) => ({ ...prev, [conv.session_id]: firstUserMsg.content }));
        } catch { /* Ignore failed session load */ }
      }
    })();
  }, [conversations]);

  const select = (id: string) => {
    if (busyRef.current) { toast.warning(getBusyWarningMessage()); return; }
    localStorage.setItem(storage.session, id);
    setSession(id);
    setMobileRecentsOpen(false);
    void loadMessages(id);
  };

  const newChat = () => {
    if (!isProfileComplete(profile)) { toast.warning("Please complete and save your creator profile before starting a conversation."); onNavigate?.("profile"); return; }
    if (busyRef.current) { toast.warning(getBusyWarningMessage()); return; }
    localStorage.removeItem(storage.session);
    setSession(null);
    setMessages([]);
    setMobileRecentsOpen(false);
    toast.info("New conversation started.");
  };

  const deleteSession = async (id: string) => {
    try {
      await request<void>(`/agent/sessions/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
      toast.success("Conversation deleted.");
      if (session === id) newChat();
      onRefresh();
    } catch (err) { toastForError(toast, err, "Unable to delete conversation"); }
  };

  const send = async (value: string) => {
    if (!isProfileComplete(profile)) { toast.warning("Please complete and save your creator profile before starting a conversation."); onNavigate?.("profile"); return; }
    if (busyRef.current) { toast.warning("A request is already in progress. Please wait for it to complete before starting another."); return; }
    const message = value.trim();
    if (!message) return;
    setInput("");
    setIsBusy(true);

    const lower = message.toLowerCase();
    if (lower.includes("sponsor") || lower.includes("opportunity") || lower.includes("opportunities") || lower.includes("brand") || lower.includes("deal") || lower.includes("find")) {
      currentActionRef.current = "opportunities";
    } else {
      currentActionRef.current = "chat";
    }

    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages((current) => [...current, { role: "user", content: message, created_at: new Date().toISOString() }]);

    try {
      let id = session;
      if (!id) {
        const created = await request<{ session_id: string }>("/agent/sessions", { method: "POST", headers: authHeaders() });
        id = created.session_id;
        setSession(id);
        localStorage.setItem(storage.session, id);
      }
      const result = await request<{ response: ResponsePayload }>(`/agent/sessions/${encodeURIComponent(id)}/messages`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ message }) });
      setIsFinishedThinking(true);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setMessages((current) => [...current, { role: "assistant", content: responseText(result.response), created_at: new Date().toISOString() }]);
      setSessionTitles((prev) => ({ ...prev, [id!]: message }));
      onRefresh();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unable to reach DealPilot. Please try again.";
      setMessages((current) => [...current, { role: "assistant", content: `__ERROR__${errMsg}`, created_at: new Date().toISOString() }]);
      toastForError(toast, err, "Message failed");
    } finally {
      setIsFinishedThinking(false);
      setIsBusy(false);
      currentActionRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const snippet = (sessionTitles[c.session_id] || "").toLowerCase();
    const dateStr = new Date(c.created_at).toLocaleDateString().toLowerCase();
    return c.session_id.toLowerCase().includes(q) || dateStr.includes(q) || snippet.includes(q);
  });

  return (
    <div className="chat-layout-wrapper">
      {mobileRecentsOpen && (<div className="chat-recents-backdrop" onClick={() => setMobileRecentsOpen(false)} />)}
      <aside className={`chat-recents-sidebar ${mobileRecentsOpen ? "mobile-open" : ""}`}>
        <div className="recents-top-actions">
          <div className="recents-header-mobile"><span>Recent Chats</span><button className="clear-search-btn" onClick={() => setMobileRecentsOpen(false)}>✕</button></div>
          <button className="new-chat-btn" onClick={newChat}><span className="icon">✏</span><span>New chat</span></button>
          <div className="search-chats-input-wrapper">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search chats" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery && (<button className="clear-search-btn" onClick={() => setSearchQuery("")}>✕</button>)}
          </div>
        </div>
        <div className="recents-header"><span>Recents</span><span className="recents-count">{filteredConversations.length}</span></div>
        <div className="recents-list">
          {filteredConversations.length === 0 ? (
            <div className="empty-recents">No recent chats</div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = conv.session_id === session;
              const dateObj = new Date(conv.created_at);
              const formattedDate = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              const rawTitle = sessionTitles[conv.session_id];
              const titleSnippet = rawTitle ? (rawTitle.length > 26 ? rawTitle.slice(0, 26) + "…" : rawTitle) : `Chat · ${formattedDate}`;
              return (
                <div key={conv.session_id} className={`recent-chat-item ${isActive ? "active" : ""}`} onClick={() => select(conv.session_id)}>
                  <span className="chat-icon">💬</span>
                  <div className="chat-info"><span className="chat-title" title={rawTitle || "Chat session"}>{titleSnippet}</span><span className="chat-date">{formattedDate}</span></div>
                  <button className="delete-chat-btn" title="Delete chat" onClick={(e) => { e.stopPropagation(); void deleteSession(conv.session_id); }}>🗑</button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <main className="chat-main-pane">
        <div className="chat-toolbar">
          <div><span className="kicker dark">Conversation workspace</span><h2>Ask DealPilot</h2></div>
          <button className="mobile-recents-toggle-btn button secondary" onClick={() => setMobileRecentsOpen(true)}>💬 Recents ({conversations.length})</button>
        </div>

        <div className="chat-history" ref={historyRef}>
          {messages.length === 0 && !busy ? (
            !isProfileComplete(profile) ? (
              <div className="chat-empty">
                <span className="kicker dark">Setup required</span>
                <h1>Complete your creator profile</h1>
                <p>To receive personalized opportunities and start conversations with DealPilot, your creator profile information must be completed and saved to the database.</p>
                <div style={{ marginTop: "16px" }}><button type="button" className="button primary" onClick={() => onNavigate?.("profile")}>Complete Profile Setup →</button></div>
              </div>
            ) : (
              <div className="chat-empty">
                <span className="kicker dark">Your deal desk</span>
                <h1>What should we explore next?</h1>
                <p>Ask about sponsors, brands, creator campaigns, affiliate programs, or partnership fit.</p>
                <div className="suggestion-chips">{SUGGESTIONS.map((s) => (<button key={s} className="suggestion-chip" onClick={() => void send(s)}>{s}</button>))}</div>
              </div>
            )
          ) : (
            <>
              {messages.map((message, index) => {
                const isError = message.role === "assistant" && message.content.startsWith("__ERROR__");
                const displayContent = isError ? message.content.replace("__ERROR__", "") : message.content;

                if (isError) {
                  return (
                    <div className="chat-message assistant error" key={`${message.created_at || index}-${index}`}>
                      <div className="message-header"><span className="message-author">DealPilot</span></div>
                      <div className="message-body"><div className="callout warning"><p>{displayContent}</p></div></div>
                      {message.created_at && (<span className="message-timestamp">{relativeTime(message.created_at)}</span>)}
                    </div>
                  );
                }

                if (message.role === "assistant") {
                  return (<AssistantMessage key={`${message.created_at || index}-${index}`} content={message.content} createdAt={message.created_at} onNavigate={onNavigate} />);
                }

                return (
                  <article className="chat-message user" key={`${message.created_at || index}-${index}`}>
                    <div className="message-header"><span className="message-author">You</span></div>
                    <div className="message-body">{message.content}</div>
                    {message.created_at && (<span className="message-timestamp">{relativeTime(message.created_at)}</span>)}
                  </article>
                );
              })}
              {busy && <TypingIndicator statusLabel={statusLabel} isFinished={isFinishedThinking} />}
            </>
          )}
          {busy && messages.length === 0 && (
            <div style={{ padding: "0 24px" }}><TypingIndicator statusLabel={statusLabel} isFinished={isFinishedThinking} /></div>
          )}
        </div>

        {!isProfileComplete(profile) && (
          <div style={{ padding: "12px 20px", background: "rgba(234, 179, 8, 0.12)", borderTop: "1px solid rgba(234, 179, 8, 0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ fontSize: "0.875rem", color: "#eab308" }}>⚠️ Creator profile must be completed and saved before starting a conversation.</span>
            <button type="button" className="button primary" style={{ padding: "6px 14px", fontSize: "0.8125rem", whiteSpace: "nowrap" }} onClick={() => onNavigate?.("profile")}>Complete Profile →</button>
          </div>
        )}

        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
          <textarea ref={textareaRef} value={input} disabled={!isProfileComplete(profile)} onChange={autoResize} onKeyDown={handleKeyDown} placeholder={!isProfileComplete(profile) ? "Complete and save your creator profile to start chatting…" : "Ask DealPilot anything… (Shift+Enter for new line)"} rows={1} />
          <button className="send-button" disabled={!input.trim() || !isProfileComplete(profile)}>↑</button>
        </form>
      </main>
    </div>
  );
}
