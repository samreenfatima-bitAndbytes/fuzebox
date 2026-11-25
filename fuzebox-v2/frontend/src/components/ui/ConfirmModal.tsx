"use client";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/Modal";

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  loadingLabel,
  destructive = false,
  titleId = "confirm-modal-title",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  destructive?: boolean;
  titleId?: string;
}) {
  const busyLabel = loadingLabel ?? confirmLabel;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (loading) return;
        onClose();
      }}
      labelledBy={titleId}
    >
      <ModalHeader
        title={title}
        titleId={titleId}
        onClose={
          loading
            ? undefined
            : () => {
                onClose();
              }
        }
      />
      <ModalBody className="min-h-[9.5rem] py-8">
        <p className="max-w-md text-sm leading-relaxed text-brand-muted">
          {description}
        </p>
      </ModalBody>
      <ModalFooter className="py-5">
        <button
          type="button"
          className="fb-btn"
          disabled={loading}
          onClick={onClose}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={
            destructive
              ? "fb-btn border-[var(--alert-error-border)] text-[var(--alert-error-text)] hover:bg-[var(--alert-error-bg)] disabled:opacity-60"
              : "fb-btn fb-btn-primary disabled:opacity-60"
          }
          disabled={loading}
          onClick={onConfirm}
        >
          {loading ? busyLabel : confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}
