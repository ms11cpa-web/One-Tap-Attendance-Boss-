/** Official contact channels supplied by Avarian Global Network. */
export const AGN_CONTACT = {
  name: 'Avarian Global Network',
  website: 'https://www.avarianglobal.com',
  facebook: 'https://www.facebook.com/avarianglobal',
  whatsappDisplay: '+880 1408-425035',
  whatsappUrl: 'https://wa.me/8801408425035',
  email: 'avarianglobalnetwork@gmail.com',
} as const;

/** Student numbers are entered by employees. Never construct links from arbitrary URL input. */
export function studentWhatsAppUrl(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (/^01[3-9]\d{8}$/.test(digits)) digits = '88' + digits;
  else if (/^1[3-9]\d{8}$/.test(digits)) digits = '880' + digits;
  else if (/^0088\d{11}$/.test(digits)) digits = digits.slice(2);
  if (!/^\d{10,15}$/.test(digits)) return null;
  return 'https://wa.me/' + digits;
}
