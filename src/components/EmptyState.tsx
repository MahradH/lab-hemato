import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="button button--primary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
