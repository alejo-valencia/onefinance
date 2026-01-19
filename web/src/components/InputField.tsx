interface InputFieldProps {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  required?: boolean;
  disabled?: boolean;
}

function InputField({
  label,
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  min,
  required = false,
  disabled = false,
}: InputFieldProps) {
  // Date inputs need special styling for the calendar icon
  const isDateInput = type === "date";

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs sm:text-sm text-gray-400 font-medium"
      >
        {label}
        {required && (
          <span className="text-red-400 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        required={required}
        disabled={disabled}
        aria-required={required}
        aria-disabled={disabled}
        className={`w-full px-3 py-2 sm:py-2.5 bg-black/30 border border-white/15 rounded-lg text-white text-sm placeholder-gray-500 transition-all duration-200 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 hover:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed ${isDateInput ? "scheme-dark [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer" : ""}`}
      />
    </div>
  );
}

export default InputField;
