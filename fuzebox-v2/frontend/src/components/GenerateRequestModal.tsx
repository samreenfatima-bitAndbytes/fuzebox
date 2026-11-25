"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { ApiError, submitWebhookRequest } from "@/lib/api";
import { WORKFLOW_EMPTY_INPUT_REASON } from "@/lib/constants";

export function GenerateRequestModal({
  open,
  onClose,
  canWrite,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  onSubmitted?: (requestId: string) => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSend() {
    if (!canWrite) return;
    if (!text.trim()) {
      setMessage(WORKFLOW_EMPTY_INPUT_REASON);
      setIsError(true);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await submitWebhookRequest(text.trim());
      setMessage(res.message);
      setIsError(false);
      setText("");
      if (res.request_id) {
        onSubmitted?.(res.request_id);
        onClose();
      }
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.message : "Failed to send request",
      );
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} align="sheet" labelledBy="generate-request-title">
      <ModalHeader
        titleId="generate-request-title"
        title="Generate request"
        description="Send a customer request through the live webhook pipeline."
        onClose={onClose}
      />
      <ModalBody>
        <label htmlFor="generate-request-text" className="fb-field-label block">
          Customer message
        </label>
        <textarea
          id="generate-request-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I can't log in and I was charged twice this month."
          rows={5}
          className="fb-input mt-1.5 w-full min-h-[100px] resize-y"
          disabled={!canWrite || loading}
        />
        {message ? (
          <div className="mt-3">
            <Alert variant={isError ? "error" : "success"}>{message}</Alert>
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="fb-btn flex-1">
          Close
        </button>
        {canWrite ? (
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !text.trim()}
            className="fb-btn-primary flex-1"
          >
            {loading ? "Sending…" : "Send to pipeline"}
          </button>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}
