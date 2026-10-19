import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Keeps every password masked until its own Show control is pressed. */
  showLabel?: string;
};

export const PasswordInput: React.FC<Props> = ({ className = '', showLabel = 'password', ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative min-w-0 w-full flex-1">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={`${visible ? 'Hide' : 'Show'} ${showLabel}`}
        title={`${visible ? 'Hide' : 'Show'} ${showLabel}`}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
