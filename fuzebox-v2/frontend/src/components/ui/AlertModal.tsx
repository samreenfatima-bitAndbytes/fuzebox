"use client";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/Modal";

export function AlertModal({
  open,
  onClose,
  title,
  description,
  actionLabel = "OK",
  variant = "info",
  titleId = "alert-modal-title",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  actionLabel?: string;
  variant?: "info" | "warn";
  titleId?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <ModalHeader title={title} titleId={titleId} onClose={onClose} />
      <ModalBody className="min-h-[9.5rem] py-8">
        <p
          className={`max-w-md text-sm leading-relaxed ${
            variant === "warn"
              ? "text-[var(--alert-warn-text)]"
              : "text-brand-muted"
          }`}
        >
          {description}
        </p>
      </ModalBody>
      <ModalFooter className="py-5">
        <button
          type="button"
          className="fb-btn-primary min-w-[6rem]"
          onClick={onClose}
        >
          {actionLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}
