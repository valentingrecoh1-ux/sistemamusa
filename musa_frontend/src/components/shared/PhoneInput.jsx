import React from "react";

const cleanPhone = (val) => val.replace(/\D/g, "").slice(0, 10);

const formatPhone = (val) => {
  const digits = cleanPhone(val);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
};

export default function PhoneInput({ value, onChange, style, className, placeholder = "11 2606-7664", ...props }) {
  const handleChange = (e) => {
    const clean = cleanPhone(e.target.value);
    onChange(clean);
  };

  return (
    <input
      type="tel"
      inputMode="numeric"
      value={formatPhone(value || "")}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      style={style}
      {...props}
    />
  );
}

export { cleanPhone, formatPhone };
