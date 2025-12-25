// components/LoadingSkeleton.tsx
/**
 * Loading skeleton components for better perceived performance
 * Shows animated placeholders while data is loading
 */

import React from 'react';

interface SkeletonTextProps {
  className?: string;
  width?: 'full' | 'half' | 'third' | string;
  height?: 'sm' | 'base' | 'lg';
}

/**
 * Animated skeleton text placeholder
 */
export const SkeletonText: React.FC<SkeletonTextProps> = ({
  className = '',
  width = 'full',
  height = 'base'
}) => {
  const widthClass = width === 'full' ? 'skeleton-text--full'
    : width === 'half' ? 'skeleton-text--half'
    : width === 'third' ? 'skeleton-text--third'
    : '';

  const heightClass = height === 'sm' ? 'skeleton-text--sm'
    : height === 'lg' ? 'skeleton-text--lg'
    : '';

  return (
    <div className={`skeleton skeleton-text ${widthClass} ${heightClass} ${className}`} />
  );
};

/**
 * Skeleton badge placeholder
 */
export const SkeletonBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton skeleton-badge ${className}`} />
);

/**
 * Skeleton button placeholder
 */
export const SkeletonButton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton skeleton-button ${className}`} />
);

/**
 * Skeleton card with multiple text lines
 */
export const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="skeleton-card">
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonText
        key={i}
        width={i === lines - 1 ? 'half' : 'full'}
      />
    ))}
  </div>
);

/**
 * Skeleton table row for admin/dashboard tables
 */
export const SkeletonTableRow: React.FC<{ columns?: number }> = ({ columns = 6 }) => (
  <tr>
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i}>
        <div className="skeleton skeleton-text" style={{ width: '80%' }} />
      </td>
    ))}
  </tr>
);

/**
 * Complete skeleton table with header and rows
 */
interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 6,
  className = ''
}) => (
  <div className="table-wrap">
    <table className={`table ${className}`}>
      <thead>
        <tr>
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i}>
              <div className="skeleton skeleton-text skeleton-text--sm" style={{ width: '60%' }} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} columns={columns} />
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * Skeleton for admin dashboard
 * Shows loading state matching the admin table layout
 */
export const AdminDashboardSkeleton: React.FC = () => (
  <div className="container">
    <div className="topbar">
      <SkeletonText width="third" height="lg" />
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <SkeletonButton />
        <SkeletonButton />
      </div>
    </div>

    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <SkeletonTable rows={8} columns={7} className="table--admin" />
    </div>
  </div>
);

/**
 * Skeleton for employee dashboard
 */
export const EmployeeDashboardSkeleton: React.FC = () => (
  <div className="container">
    <div className="topbar">
      <SkeletonText width="half" height="lg" />
      <SkeletonButton />
    </div>

    <div style={{ marginTop: 'var(--space-4)' }}>
      <SkeletonCard lines={2} />
      <div style={{ marginTop: 'var(--space-4)' }}>
        <SkeletonTable rows={5} columns={5} />
      </div>
    </div>
  </div>
);
