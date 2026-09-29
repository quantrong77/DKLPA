import React from 'react';

/**
 * Consistent empty state: icon, one-line title, optional hint and actions.
 * compact = for side panels and small lists.
 */
export default function EmptyState({ icon: Icon, title, description, children, compact = false, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-6'} ${className}`}
      role="status"
    >
      {Icon && (
        <div
          className={`${compact ? 'w-10 h-10 mb-2' : 'w-12 h-12 mb-3'} rounded-xl bg-chatlan-50 text-chatlan-600 flex items-center justify-center`}
        >
          <Icon className={compact ? 'w-5 h-5' : 'w-6 h-6'} aria-hidden="true" />
        </div>
      )}
      <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-700`}>{title}</p>
      {description && <p className="mt-1 text-xs text-slate-500 max-w-xs">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}
