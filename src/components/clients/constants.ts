/** Shared option lists for client forms (plain module: safe on server and client). */

export const INDUSTRIES = [
  "Agency / Marketing",
  "Software / IT",
  "E-commerce / Retail",
  "Manufacturing",
  "Healthcare",
  "Education",
  "Finance / Insurance",
  "Real estate / Construction",
  "Hospitality / Travel",
  "Media / Entertainment",
  "Non-profit",
  "Professional services",
  "Other",
] as const;

export const CLIENT_SOURCES = [
  "Referral",
  "Website",
  "Social media",
  "Cold outreach",
  "Event / Meetup",
  "Marketplace",
  "Existing client",
  "Other",
] as const;

export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

export const CLIENT_HEALTH_OPTIONS = [
  { value: "GOOD", label: "Good" },
  { value: "WATCH", label: "Watch" },
  { value: "AT_RISK", label: "At risk" },
] as const;

export const CLIENT_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
] as const;
