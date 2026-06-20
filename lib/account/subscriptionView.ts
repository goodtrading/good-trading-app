import type { AuthAccess, AuthUser } from "@/lib/auth/types";

export type SubscriptionPlanState =
  | "free"
  | "pro_active"
  | "access_restricted"
  | "expired"
  | "cancelled"
  | "saas_disabled";

export type SubscriptionViewModel = {
  planState: SubscriptionPlanState;
  planLabel: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "muted" | "danger";
  showUpgradeCta: boolean;
  showManageCta: boolean;
  showReactivateCta: boolean;
  billingCycleLabel: string | null;
  renewalLabel: string | null;
  accessUntilLabel: string | null;
  helperText: string | null;
};

function readAccessAllowed(access: AuthAccess | null): boolean {
  return access?.allowed === true;
}

function readAccessString(access: AuthAccess | null, key: string): string | null {
  const value = access?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readAccessStatus(access: AuthAccess | null): string | null {
  return (
    readAccessString(access, "status") ??
    readAccessString(access, "subscriptionStatus") ??
    readAccessString(access, "state")
  );
}

function formatAccessDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function readBillingCycle(access: AuthAccess | null): string | null {
  const raw =
    readAccessString(access, "billingCycle") ??
    readAccessString(access, "billingInterval") ??
    readAccessString(access, "interval");
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized.includes("year") || normalized.includes("annual") || normalized === "yearly") {
    return "Anual";
  }
  if (normalized.includes("month") || normalized === "monthly") {
    return "Mensual";
  }
  return raw;
}

export function resolveSubscriptionView(args: {
  user: AuthUser | null;
  access: AuthAccess | null;
  saasDisabled: boolean;
  isAuthenticated: boolean;
}): SubscriptionViewModel {
  const { access, saasDisabled, isAuthenticated } = args;

  if (!isAuthenticated) {
    return {
      planState: "free",
      planLabel: "Sin sesión",
      statusLabel: "No autenticado",
      statusTone: "muted",
      showUpgradeCta: false,
      showManageCta: false,
      showReactivateCta: false,
      billingCycleLabel: null,
      renewalLabel: null,
      accessUntilLabel: null,
      helperText: null,
    };
  }

  if (saasDisabled) {
    return {
      planState: "saas_disabled",
      planLabel: "GoodTrading Pro",
      statusLabel: "Servicio pausado",
      statusTone: "danger",
      showUpgradeCta: false,
      showManageCta: false,
      showReactivateCta: true,
      billingCycleLabel: readBillingCycle(access),
      renewalLabel: null,
      accessUntilLabel: null,
      helperText: "El servicio SaaS está deshabilitado temporalmente.",
    };
  }

  const status = readAccessStatus(access)?.toLowerCase() ?? null;
  const renewalLabel = formatAccessDate(
    readAccessString(access, "renewalAt") ??
      readAccessString(access, "renewsAt") ??
      readAccessString(access, "nextBillingAt"),
  );
  const accessUntilLabel = formatAccessDate(
    readAccessString(access, "accessUntil") ??
      readAccessString(access, "expiresAt") ??
      readAccessString(access, "validUntil"),
  );
  const billingCycleLabel = readBillingCycle(access);

  if (status && (status.includes("cancel") || status.includes("canceled"))) {
    return {
      planState: "cancelled",
      planLabel: "GoodTrading Pro",
      statusLabel: "Cancelado",
      statusTone: "warning",
      showUpgradeCta: false,
      showManageCta: false,
      showReactivateCta: true,
      billingCycleLabel,
      renewalLabel: null,
      accessUntilLabel,
      helperText: accessUntilLabel
        ? "Mantenés acceso hasta la fecha indicada."
        : "Tu suscripción fue cancelada.",
    };
  }

  if (
    status &&
    (status.includes("expir") || status.includes("past_due") || status.includes("lapsed"))
  ) {
    return {
      planState: "expired",
      planLabel: "GoodTrading Pro",
      statusLabel: "Vencido",
      statusTone: "danger",
      showUpgradeCta: false,
      showManageCta: false,
      showReactivateCta: true,
      billingCycleLabel,
      renewalLabel: null,
      accessUntilLabel,
      helperText: "Tu plan venció. Reactivalo para recuperar el acceso completo.",
    };
  }

  if (!readAccessAllowed(access)) {
    return {
      planState: "access_restricted",
      planLabel: "Gratuito",
      statusLabel: "Sin acceso Pro",
      statusTone: "warning",
      showUpgradeCta: true,
      showManageCta: false,
      showReactivateCta: false,
      billingCycleLabel: null,
      renewalLabel: null,
      accessUntilLabel: null,
      helperText: "Tu cuenta no tiene acceso activo a la terminal.",
    };
  }

  return {
    planState: "pro_active",
    planLabel: "GoodTrading Pro",
    statusLabel: "Activo",
    statusTone: "success",
    showUpgradeCta: false,
    showManageCta: true,
    showReactivateCta: false,
    billingCycleLabel,
    renewalLabel,
    accessUntilLabel: null,
    helperText: null,
  };
}

export function shouldShowFullPaywall(planState: SubscriptionPlanState): boolean {
  return (
    planState === "free" ||
    planState === "access_restricted" ||
    planState === "expired" ||
    planState === "cancelled"
  );
}
