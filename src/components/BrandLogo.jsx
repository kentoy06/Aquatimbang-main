import React from "react";

// AquaTimbang logo files live in public/images (replace them to update the logo).
export const LOGO_MARK = `${import.meta.env.BASE_URL}images/logo-mark.png`;
export const LOGO_FULL = `${import.meta.env.BASE_URL}images/logo.png`;

// The fish mark of the logo, sized by its container.
export function BrandMark({ alt = "AquaTimbang" }) {
  return <img className="brand-mark-img" src={LOGO_MARK} alt={alt} />;
}
