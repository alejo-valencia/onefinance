interface InputFieldProps {
  label: string;
  id: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
}

function InputField({
  label,
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  min,
}: InputFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gray-400 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        className="w-full px-3 py-2.5 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
      />
    </div>
  );
}

export default InputField;
