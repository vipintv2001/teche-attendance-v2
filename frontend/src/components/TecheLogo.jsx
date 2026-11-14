import React from 'react';

export default function TecheLogo({ compact = false }) {
  return (
    <div
      className={`flex items-center ${compact
          ? 'gap-2.5'
          : 'flex-col items-center justify-center gap-1.5 text-center'
        }`}
    >
      <img
        src="/teche_logo.png"
        alt="TechE Education"
        className={`${compact
            ? 'h-8 max-w-[150px]'
            : 'h-12 sm:h-14 max-w-[220px] sm:max-w-[260px]'
          } object-contain`}
      />
      {!compact && (
        <p className="text-xs font-medium tracking-wide text-slate-500">
          Employee Attendance Portal
        </p>
      )}
    </div>
  );
}