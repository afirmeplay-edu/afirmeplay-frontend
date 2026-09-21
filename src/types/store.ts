export type StoreCategory = 'frame' | 'stamp' | 'sidebar_theme' | 'physical';

export type StoreRequirementType =
  | 'competition_band'
  | 'eval_min_grade'
  | 'eval_classification'
  | 'achievement';

export interface StoreRequirement {
  type: StoreRequirementType;
  min_band?: string;
  min_grade?: number;
  min_classification?: string;
  id?: string;
  medal?: string;
}

export interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: StoreCategory;
  reward_type: string;
  reward_data: string | null;
  is_physical: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
  already_purchased?: boolean;
  /** Nome do ícone (ex.: Lucide) para exibir na loja */
  icon?: string | null;
  /** Cor de destaque (chave: amber, blue, violet... ou hex) */
  icon_color?: string | null;
  requirement?: StoreRequirement | null;
  requirement_met?: boolean | null;
  requirement_reason?: string | null;
}

export interface StorePurchaseResponse {
  message: string;
  purchase: {
    id: string;
    student_id: string;
    store_item_id: string;
    price_paid: number;
    created_at: string;
  };
  new_balance: number;
  reward_type: string;
  reward_data: string | null;
}

export interface StudentPurchase {
  id: string;
  student_id: string;
  store_item_id: string;
  price_paid: number;
  created_at: string;
  item_name: string | null;
  reward_type: string | null;
  reward_data: string | null;
}

export interface StoreItemsResponse {
  items: StoreItem[];
}

export interface MyPurchasesResponse {
  purchases: StudentPurchase[];
  limit: number;
  offset: number;
}

// --- Admin / gestão da loja ---

export type StoreScopeType = 'system' | 'city' | 'school' | 'class';

export interface StoreScopeFilter {
  city_ids?: string[];
  school_ids?: string[];
  class_ids?: string[];
}

export interface StoreItemAdmin {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  reward_type: string;
  reward_data: string | null;
  is_physical: boolean;
  scope_type: string;
  scope_filter: StoreScopeFilter | null;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
  icon?: string | null;
  icon_color?: string | null;
  requirement?: StoreRequirement | null;
}

export interface StoreItemCreatePayload {
  name: string;
  description?: string | null;
  price: number;
  category: string;
  reward_type?: string;
  reward_data?: string | null;
  is_physical?: boolean;
  scope_type: StoreScopeType;
  scope_filter?: StoreScopeFilter | null;
  is_active?: boolean;
  sort_order?: number;
  icon?: string | null;
  icon_color?: string | null;
  requirement?: StoreRequirement | null;
}

export interface StoreRequirementOption {
  value: string;
  label: string;
}

export interface StoreRequirementAchievementOption {
  id: string;
  nome: string;
}

export interface StoreRequirementOptionsResponse {
  types: StoreRequirementType[];
  competition_bands: StoreRequirementOption[];
  eval_classifications: StoreRequirementOption[];
  medals: StoreRequirementOption[];
  achievements: StoreRequirementAchievementOption[];
}

export interface StoreAdminItemsResponse {
  items: StoreItemAdmin[];
}

export interface StoreAllowedScopesResponse {
  allowed_scopes: string[];
}
