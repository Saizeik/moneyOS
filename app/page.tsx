"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Transaction = {
  id: string;
  amount: number;
  category: string;
  merchant?: string | null;
  memo?: string | null;
  account_id?: string | null;
  transaction_date?: string | null;
  transaction_type?: "income" | "expense" | null;
  created_at: string;
};

type Account = {
  id: string;
  name: string;
  type: string;
  current_balance: number;
};

type BudgetCategory = {
  id: string;
  name: string;
  group_name: string;
  weekly_limit: number;
  monthly_limit: number;
  target_day?: number | null;
  split_across_paychecks?: boolean | null;
  priority: number;
  rollover: boolean;
};

type Debt = {
  id: string;
  name: string;
  balance: number;
  interest: number;
  min_payment: number;
};

type DebtStrategy = "snowball" | "avalanche";

type Savings = {
  id: string;
  name: string;
  goal: number;
  current: number;
  linked_category_id?: string | null;
};

type RecurringBill = {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  category: string;
  is_paid: boolean;
  counts_toward_available_cash?: boolean | null;
  split_across_paychecks?: boolean | null;
};

type NetWorthSnapshot = {
  id: string;
  assets: number;
  debts: number;
  net_worth: number;
  snapshot_date: string;
};

type BudgetAssignmentRow = {
  item_key: string;
  assigned: number;
};

type MonthlyBudgetStateRow = {
  month_key: string;
  monthly_income: number | null;
};

type PayScheduleType = "weekly" | "biweekly" | "twice_monthly" | "monthly";

type PaycheckSettingsRow = {
  schedule_type: PayScheduleType;
  anchor_date: string | null;
  monthly_day: number | null;
  first_twice_monthly_day: number | null;
  second_twice_monthly_day: number | null;
};

type PaycheckSettings = {
  type: PayScheduleType;
  anchorDate: string;
  monthlyDay: string;
  firstTwiceMonthlyDay: string;
  secondTwiceMonthlyDay: string;
};

type PaycheckHistoryRow = {
  id: string;
  received_date: string;
  amount: number | null;
  expected_date: string | null;
  source_transaction_id: string | null;
  note: string | null;
  created_at: string;
};

type MobileTab = "home" | "budget" | "spending" | "bills" | "plan";
type WorkspaceDensity = "comfortable" | "compact";
type IconName =
  | "home"
  | "budget"
  | "spending"
  | "bills"
  | "plan"
  | "success"
  | "warning"
  | "info";

function normalizeError(error: unknown) {
  if (!error) {
    return {
      message: "Supabase request failed.",
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message || "Supabase request failed.",
      name: error.name,
    };
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;

    return {
      message:
        typeof record.message === "string"
          ? record.message
          : "Supabase request failed.",
      details: typeof record.details === "string" ? record.details : undefined,
      hint: typeof record.hint === "string" ? record.hint : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      status:
        typeof record.status === "number" ? String(record.status) : undefined,
    };
  }

  return {
    message: String(error),
  };
}

function getErrorMessage(error: unknown) {
  const formatted = normalizeError(error);

  return [formatted.message, formatted.details, formatted.hint, formatted.code]
    .filter(Boolean)
    .join(" | ");
}

function logSupabaseError(label: string, error: unknown, context?: unknown) {
  console.error(label, {
    ...normalizeError(error),
    context,
    raw: error,
  });
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function AppIcon({
  name,
  className = "h-4 w-4",
}: {
  name: IconName;
  className?: string;
}) {
  const sharedProps = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path {...sharedProps} d="M3 10.5 12 3l9 7.5" />
          <path {...sharedProps} d="M5.5 9.5V21h13V9.5" />
          <path {...sharedProps} d="M9.5 21v-6h5v6" />
        </svg>
      );
    case "budget":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect {...sharedProps} x="3" y="5" width="18" height="14" rx="2.5" />
          <path {...sharedProps} d="M3 9h18" />
          <path {...sharedProps} d="M8 14h3M14 14h2" />
        </svg>
      );
    case "spending":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path {...sharedProps} d="M4 7h16" />
          <path {...sharedProps} d="M6.5 7 8 4h8l1.5 3" />
          <path {...sharedProps} d="M5 7v10a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V7" />
          <path {...sharedProps} d="M12 10v6M9 13h6" />
        </svg>
      );
    case "bills":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect {...sharedProps} x="4" y="3.5" width="16" height="17" rx="2.5" />
          <path {...sharedProps} d="M8 2.5v3M16 2.5v3M4 8.5h16" />
          <path {...sharedProps} d="M8 12h8M8 16h5" />
        </svg>
      );
    case "plan":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path {...sharedProps} d="M12 3v18" />
          <path {...sharedProps} d="m5 8 7 4 7-4" />
          <path {...sharedProps} d="m5 16 7-4 7 4" />
        </svg>
      );
    case "success":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle {...sharedProps} cx="12" cy="12" r="9" />
          <path {...sharedProps} d="m8.5 12.5 2.3 2.3 4.7-5.3" />
        </svg>
      );
    case "warning":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path {...sharedProps} d="M12 4 3.5 19h17L12 4Z" />
          <path {...sharedProps} d="M12 9v4.5M12 17h.01" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle {...sharedProps} cx="12" cy="12" r="9" />
          <path {...sharedProps} d="M12 10v5M12 7h.01" />
        </svg>
      );
  }
}

const dashboardPanelClass =
  "rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 shadow-[0_12px_40px_rgba(0,0,0,0.22)]";

function DashboardPanel({
  className = "",
  title,
  subtitle,
  right,
  density = "comfortable",
  children,
}: {
  className?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  density?: WorkspaceDensity;
  children: ReactNode;
}) {
  return (
    <section
      className={`${dashboardPanelClass} ${
        density === "compact" ? "p-3 lg:p-3.5" : "p-4 lg:p-5"
      } ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          {subtitle ? (
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          ) : null}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  tone?: "default" | "warning";
  className?: string;
}) {
  const toneClass =
    tone === "warning"
      ? "border-red-400/20"
      : "border-slate-700";

  return (
    <div
      className={`rounded-2xl border border-dashed ${toneClass} bg-black/20 p-4 text-sm text-gray-500 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  valueClassName = "mt-2 text-2xl text-slate-50",
  className = "",
  density = "comfortable",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  valueClassName?: string;
  className?: string;
  density?: WorkspaceDensity;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-700/80 bg-slate-950/35 ${
        density === "compact" ? "p-3" : "p-4"
      } ${className}`.trim()}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className={valueClassName}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-gray-500">{detail}</p> : null}
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  className = "",
  density = "comfortable",
}: {
  title: string;
  rows: Array<{
    label: string;
    value: string;
    tone?: "default" | "positive" | "negative";
  }>;
  className?: string;
  density?: WorkspaceDensity;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-black/25 ${
        density === "compact" ? "p-3" : "p-4"
      } ${className}`.trim()}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div
            key={`${title}-${row.label}`}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-slate-400">{row.label}</span>
            <span
              className={
                row.tone === "positive"
                  ? "text-emerald-300"
                  : row.tone === "negative"
                    ? "text-red-300"
                    : "text-slate-100"
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  helper,
  className = "",
  children,
}: {
  label: string;
  helper?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block text-sm text-gray-300 ${className}`.trim()}>
      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
        {label}
      </span>
      {children}
      {helper ? <span className="mt-2 block text-xs text-gray-500">{helper}</span> : null}
    </label>
  );
}

function ActionButton({
  children,
  className = "",
  tone = "secondary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const toneClass =
    tone === "primary"
      ? "border-cyan-400 bg-cyan-400 text-black"
      : tone === "danger"
        ? "border-red-500/50 text-red-300"
        : tone === "ghost"
          ? "border-gray-600 text-gray-300"
          : "border-cyan-400 text-cyan-300";

  return (
    <button
      {...props}
      className={`rounded-xl border px-4 py-2 transition ${toneClass} ${className}`.trim()}
    >
      {children}
    </button>
  );
}

function getTransactionType(transaction: Transaction) {
  return transaction.transaction_type === "income" ? "income" : "expense";
}

function getTransactionDate(transaction: Transaction) {
  return new Date(transaction.transaction_date || transaction.created_at);
}

function getTransactionSignedAmount(transaction: Transaction) {
  const absoluteAmount = Math.abs(Number(transaction.amount || 0));
  return getTransactionType(transaction) === "income"
    ? absoluteAmount
    : -absoluteAmount;
}

function getTransactionExpenseAmount(transaction: Transaction) {
  return getTransactionType(transaction) === "expense"
    ? Math.abs(Number(transaction.amount || 0))
    : 0;
}

function normalizeMerchantName(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function detectRecurringCadence(transactions: Transaction[]) {
  if (transactions.length < 3) return null;

  const sortedDates = transactions
    .map((transaction) => startOfDay(getTransactionDate(transaction)).getTime())
    .sort((a, b) => a - b);
  const intervals: number[] = [];

  for (let index = 1; index < sortedDates.length; index += 1) {
    intervals.push(
      Math.round((sortedDates[index] - sortedDates[index - 1]) / 86400000)
    );
  }

  const averageInterval =
    intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

  if (averageInterval >= 26 && averageInterval <= 35) {
    return "monthly";
  }

  if (averageInterval >= 12 && averageInterval <= 16) {
    return "biweekly";
  }

  if (averageInterval >= 5 && averageInterval <= 9) {
    return "weekly";
  }

  return null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function getCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getBudgetAssignmentStorageKey(monthKey: string) {
  return `money-os:budget-assignments:${monthKey}`;
}

function getDaySuffix(day: number) {
  if (day >= 11 && day <= 13) return "th";
  const lastDigit = day % 10;
  if (lastDigit === 1) return "st";
  if (lastDigit === 2) return "nd";
  if (lastDigit === 3) return "rd";
  return "th";
}

function getDaysRemainingInMonth(date: Date) {
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return Math.max(endOfMonth.getDate() - date.getDate() + 1, 1);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function parseLocalDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampDay(year: number, month: number, day: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), daysInMonth);
}

function buildLocalDate(year: number, month: number, day: number) {
  return new Date(year, month, clampDay(year, month, day));
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffInDays(from: Date, to: Date) {
  const fromStart = startOfDay(from).getTime();
  const toStart = startOfDay(to).getTime();
  return Math.max(Math.ceil((toStart - fromStart) / 86400000), 0);
}

function getNextPayday(
  settings: PaycheckSettings,
  now: Date,
  strictlyFuture = false
) {
  const today = startOfDay(now);

  if (settings.type === "weekly" || settings.type === "biweekly") {
    const anchor = parseLocalDate(settings.anchorDate);
    if (!anchor) return null;

    const intervalDays = settings.type === "weekly" ? 7 : 14;
    const candidate = startOfDay(anchor);

    while (strictlyFuture ? candidate <= today : candidate < today) {
      candidate.setDate(candidate.getDate() + intervalDays);
    }

    return candidate;
  }

  if (settings.type === "monthly") {
    const monthlyDay = Number(settings.monthlyDay || 1);
    const currentMonthPayday = buildLocalDate(
      today.getFullYear(),
      today.getMonth(),
      monthlyDay
    );

    if (strictlyFuture ? currentMonthPayday > today : currentMonthPayday >= today) {
      return currentMonthPayday;
    }

    return buildLocalDate(today.getFullYear(), today.getMonth() + 1, monthlyDay);
  }

  const firstDay = Number(settings.firstTwiceMonthlyDay || 1);
  const secondDay = Number(settings.secondTwiceMonthlyDay || 15);
  const dayOptions = [firstDay, secondDay].sort((a, b) => a - b);
  const candidates = [
    buildLocalDate(today.getFullYear(), today.getMonth(), dayOptions[0]),
    buildLocalDate(today.getFullYear(), today.getMonth(), dayOptions[1]),
    buildLocalDate(today.getFullYear(), today.getMonth() + 1, dayOptions[0]),
    buildLocalDate(today.getFullYear(), today.getMonth() + 1, dayOptions[1]),
  ];

  return (
    candidates.find((candidate) =>
      strictlyFuture ? candidate > today : candidate >= today
    ) || null
  );
}

function getNextDueDate(dueDay: number, now: Date) {
  const today = startOfDay(now);
  const currentMonthDueDate = buildLocalDate(
    today.getFullYear(),
    today.getMonth(),
    dueDay
  );

  if (currentMonthDueDate >= today) {
    return currentMonthDueDate;
  }

  return buildLocalDate(today.getFullYear(), today.getMonth() + 1, dueDay);
}

function getPaydaysThroughDate(
  settings: PaycheckSettings,
  now: Date,
  endDate: Date,
  maxOccurrences = 6,
  strictlyFuture = false
) {
  const paydays: Date[] = [];
  let cursor = startOfDay(now);

  for (let index = 0; index < maxOccurrences; index += 1) {
    const nextPayday = getNextPayday(settings, cursor, strictlyFuture || index > 0);

    if (!nextPayday || nextPayday > endDate) {
      break;
    }

    paydays.push(nextPayday);

    const nextCursor = new Date(nextPayday);
    nextCursor.setDate(nextCursor.getDate() + 1);
    cursor = nextCursor;
  }

  return paydays;
}

function getCurrentPaycheckReserveAmount(
  amount: number,
  dueDate: Date | null,
  settings: PaycheckSettings,
  now: Date,
  nextPayday: Date | null,
  splitAcrossPaychecks: boolean,
  strictlyFuture = false
) {
  if (!dueDate || amount <= 0) return 0;

  if (splitAcrossPaychecks) {
    const paydaysRemaining = getPaydaysThroughDate(
      settings,
      now,
      dueDate,
      6,
      strictlyFuture
    ).length;
    const paycheckSlicesRemaining = Math.max(paydaysRemaining, 1);
    return amount / paycheckSlicesRemaining;
  }

  if (!nextPayday) {
    return amount;
  }

  return dueDate <= nextPayday ? amount : 0;
}

function getPaycheckStorageKey(userId: string | null) {
  return userId ? `money-os:paycheck-settings:${userId}` : "money-os:paycheck-settings";
}

function getWorkspaceDensityStorageKey(userId: string | null) {
  return userId
    ? `money-os:workspace-density:${userId}`
    : "money-os:workspace-density";
}

function getEffectivePaycheckSettings(
  settings: PaycheckSettings,
  latestReceivedPaycheck: PaycheckHistoryRow | null
) {
  if (
    !latestReceivedPaycheck ||
    (settings.type !== "weekly" && settings.type !== "biweekly")
  ) {
    return settings;
  }

  return {
    ...settings,
    anchorDate: latestReceivedPaycheck.received_date,
  };
}

function pickTargetDebtIndex(
  debts: Array<{ balance: number; interest: number }>,
  strategy: DebtStrategy
) {
  let targetIndex = -1;

  debts.forEach((debt, index) => {
    if (debt.balance <= 0) return;

    if (targetIndex === -1) {
      targetIndex = index;
      return;
    }

    const current = debts[targetIndex];

    if (strategy === "avalanche") {
      if (
        debt.interest > current.interest ||
        (debt.interest === current.interest && debt.balance < current.balance)
      ) {
        targetIndex = index;
      }
      return;
    }

    if (
      debt.balance < current.balance ||
      (debt.balance === current.balance && debt.interest > current.interest)
    ) {
      targetIndex = index;
    }
  });

  return targetIndex;
}

function simulateDebtPlan(
  debts: Debt[],
  strategy: DebtStrategy,
  extraPayment: number,
  startDate: Date
) {
  const activeDebts = debts
    .map((debt) => ({
      id: debt.id,
      name: debt.name.trim() || "Unnamed debt",
      balance: Number(debt.balance),
      interest: Number(debt.interest),
      min_payment: Number(debt.min_payment),
    }))
    .filter(
      (debt) =>
        Number.isFinite(debt.balance) &&
        Number.isFinite(debt.interest) &&
        Number.isFinite(debt.min_payment) &&
        debt.balance > 0
    );

  if (activeDebts.length === 0) {
    return {
      months: 0,
      totalInterest: 0,
      debtFreeDate: startDate,
      payoffOrder: [] as Array<{
        id: string;
        name: string;
        month: number;
        dateLabel: string;
      }>,
    };
  }

  const simulated = activeDebts.map((debt) => ({ ...debt }));
  const payoffOrder: Array<{
    id: string;
    name: string;
    month: number;
    dateLabel: string;
  }> = [];
  let months = 0;
  let totalInterest = 0;

  while (simulated.some((debt) => debt.balance > 0) && months < 600) {
    months += 1;

    simulated.forEach((debt) => {
      if (debt.balance <= 0) return;
      const interestCharge = debt.balance * (debt.interest / 100 / 12);
      debt.balance += interestCharge;
      totalInterest += interestCharge;
    });

    let budget =
      simulated
        .filter((debt) => debt.balance > 0)
        .reduce((sum, debt) => sum + debt.min_payment, 0) + extraPayment;

    simulated.forEach((debt) => {
      if (debt.balance <= 0 || budget <= 0) return;
      const minimumPayment = Math.min(debt.min_payment, debt.balance, budget);
      debt.balance -= minimumPayment;
      budget -= minimumPayment;
    });

    while (budget > 0 && simulated.some((debt) => debt.balance > 0.01)) {
      const targetIndex = pickTargetDebtIndex(simulated, strategy);

      if (targetIndex === -1) break;

      const targetDebt = simulated[targetIndex];
      const extraTowardTarget = Math.min(targetDebt.balance, budget);
      targetDebt.balance -= extraTowardTarget;
      budget -= extraTowardTarget;
    }

    simulated.forEach((debt) => {
      if (
        debt.balance <= 0.01 &&
        !payoffOrder.some((entry) => entry.id === debt.id)
      ) {
        debt.balance = 0;
        payoffOrder.push({
          id: debt.id,
          name: debt.name,
          month: months,
          dateLabel: formatMonthYear(addMonths(startDate, months - 1)),
        });
      }
    });
  }

  return {
    months,
    totalInterest,
    debtFreeDate: addMonths(startDate, Math.max(months - 1, 0)),
    payoffOrder,
  };
}

const DEFAULT_CATEGORIES = [
  { name: "Groceries", group_name: "Needs", weekly_limit: 100, monthly_limit: 400, target_day: null, split_across_paychecks: false },
  { name: "Transportation", group_name: "Needs", weekly_limit: 20, monthly_limit: 80, target_day: null, split_across_paychecks: false },
  { name: "Car Maintenance", group_name: "Needs", weekly_limit: 0, monthly_limit: 0, target_day: null, split_across_paychecks: false },
  { name: "Emergency Fund", group_name: "Savings", weekly_limit: 21, monthly_limit: 83.34, target_day: 31, split_across_paychecks: false },
  { name: "Eating Out", group_name: "Overspending Defense", weekly_limit: 25, monthly_limit: 100, target_day: null, split_across_paychecks: false },
  { name: "Convenience Stores", group_name: "Overspending Defense", weekly_limit: 12.5, monthly_limit: 50, target_day: null, split_across_paychecks: false },
  { name: "Kids", group_name: "Family", weekly_limit: 25, monthly_limit: 100, target_day: null, split_across_paychecks: false },
  { name: "Misc", group_name: "Flexible", weekly_limit: 25, monthly_limit: 100, target_day: null, split_across_paychecks: false },
  { name: "Credit Card Payments", group_name: "Debt", weekly_limit: 0, monthly_limit: 62.97, target_day: 23, split_across_paychecks: false },
  { name: "Rent", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 1495, target_day: 31, split_across_paychecks: true },
  { name: "Utilities", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 0, target_day: 31, split_across_paychecks: false },
  { name: "TV, Phone and Internet", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 50, target_day: 23, split_across_paychecks: false },
  { name: "Insurance", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 0, target_day: 31, split_across_paychecks: false },
  { name: "Auto Loans", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 293, target_day: 11, split_across_paychecks: false },
  { name: "Personal Loans", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 122.83, target_day: 19, split_across_paychecks: false },
  { name: "Buy Now, Pay Later", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 577.64, target_day: 31, split_across_paychecks: false },
  { name: "Music", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 10.99, target_day: 18, split_across_paychecks: false },
  { name: "Netflix and Disney Plus", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 33.54, target_day: 23, split_across_paychecks: false },
];

const DEFAULT_BILLS = [
  { name: "Rent", amount: 1495, due_day: 31, category: "Rent", counts_toward_available_cash: true, split_across_paychecks: true },
  { name: "Utilities", amount: 0, due_day: 31, category: "Utilities", counts_toward_available_cash: true, split_across_paychecks: false },
  { name: "TV, Phone and Internet", amount: 50, due_day: 23, category: "TV, Phone and Internet", counts_toward_available_cash: true, split_across_paychecks: false },
  { name: "Insurance", amount: 0, due_day: 31, category: "Insurance", counts_toward_available_cash: true, split_across_paychecks: false },
  { name: "Auto Loans", amount: 293, due_day: 11, category: "Auto Loans", counts_toward_available_cash: false, split_across_paychecks: false },
  { name: "Personal Loans", amount: 122.83, due_day: 19, category: "Personal Loans", counts_toward_available_cash: false, split_across_paychecks: false },
  { name: "Buy Now, Pay Later", amount: 577.64, due_day: 31, category: "Buy Now, Pay Later", counts_toward_available_cash: false, split_across_paychecks: false },
  { name: "Music", amount: 10.99, due_day: 18, category: "Music", counts_toward_available_cash: true, split_across_paychecks: false },
  { name: "Netflix and Disney Plus", amount: 33.54, due_day: 23, category: "Netflix and Disney Plus", counts_toward_available_cash: true, split_across_paychecks: false },
];

const DEFAULT_MONTHLY_INCOME = 4056;

const USER_DEBT_PRESET = [
  {
    name: "Zip",
    balance: 270,
    interest: 0,
    min_payment: 0,
  },
  {
    name: "Chase Freedom Unlimited - 6057",
    balance: 944,
    interest: 27,
    min_payment: 0,
  },
  {
    name: "Kids Mom",
    balance: 512,
    interest: 0,
    min_payment: 0,
  },
  {
    name: "Parents",
    balance: 14212,
    interest: 0,
    min_payment: 0,
  },
] as const;

const DEFAULT_PAYCHECK_SETTINGS: PaycheckSettings = {
  type: "biweekly",
  anchorDate: formatInputDate(new Date()),
  monthlyDay: "1",
  firstTwiceMonthlyDay: "1",
  secondTwiceMonthlyDay: "15",
};

const MOBILE_TABS: Array<{ id: MobileTab; label: string; icon: IconName }> = [
  { id: "home", label: "Home", icon: "home" },
  { id: "budget", label: "Budget", icon: "budget" },
  { id: "spending", label: "Spending", icon: "spending" },
  { id: "bills", label: "Bills", icon: "bills" },
  { id: "plan", label: "Plan", icon: "plan" },
];

const OVESPENDING_KEYWORDS = [
  "food",
  "grocery",
  "groceries",
  "dining",
  "eating",
  "restaurant",
  "shopping",
  "entertainment",
  "convenience",
  "misc",
  "fun",
  "coffee",
  "takeout",
  "delivery",
];

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<Savings[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorthSnapshot | null>(null);
  const [netWorthHistory, setNetWorthHistory] = useState<NetWorthSnapshot[]>([]);
  const [paycheckHistory, setPaycheckHistory] = useState<PaycheckHistoryRow[]>([]);

  const [amount, setAmount] = useState("");
  const [transactionMerchant, setTransactionMerchant] = useState("");
  const [transactionMemo, setTransactionMemo] = useState("");
  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [transactionDateInput, setTransactionDateInput] = useState(
    formatInputDate(new Date())
  );
  const [transactionType, setTransactionType] = useState<"income" | "expense">(
    "expense"
  );
  const [transactionCountsAsPaycheck, setTransactionCountsAsPaycheck] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("Groceries");
  const [planned, setPlanned] = useState("");
  const [bankBalanceInput, setBankBalanceInput] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryGroup, setNewCategoryGroup] = useState("Flexible");
  const [newCategoryWeeklyLimit, setNewCategoryWeeklyLimit] = useState("");
  const [newCategoryMonthlyLimit, setNewCategoryMonthlyLimit] = useState("");
  const [newCategoryTargetDay, setNewCategoryTargetDay] = useState("");
  const [newCategorySplitAcrossPaychecks, setNewCategorySplitAcrossPaychecks] = useState(false);
  const [categoryFormMessage, setCategoryFormMessage] = useState<string | null>(null);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [newBillName, setNewBillName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillDueDay, setNewBillDueDay] = useState("");
  const [newBillCategory, setNewBillCategory] = useState("Rent");
  const [newBillSplitAcrossPaychecks, setNewBillSplitAcrossPaychecks] = useState(false);
  const [newDebtName, setNewDebtName] = useState("");
  const [newDebtBalance, setNewDebtBalance] = useState("");
  const [newDebtInterest, setNewDebtInterest] = useState("");
  const [newDebtMinPayment, setNewDebtMinPayment] = useState("");
  const [debtStrategy, setDebtStrategy] = useState<DebtStrategy>("snowball");
  const [extraDebtPayment, setExtraDebtPayment] = useState("0");
  const [monthlyIncomeInput, setMonthlyIncomeInput] = useState(String(DEFAULT_MONTHLY_INCOME));
  const [monthlyBudgetSyncReady, setMonthlyBudgetSyncReady] = useState(false);
  const [assignedBudget, setAssignedBudget] = useState<Record<string, number>>({});
  const [assignmentSyncReady, setAssignmentSyncReady] = useState(false);
  const [paycheckSettings, setPaycheckSettings] = useState<PaycheckSettings>(
    DEFAULT_PAYCHECK_SETTINGS
  );
  const [paycheckSyncReady, setPaycheckSyncReady] = useState(false);
  const [expandedDebts, setExpandedDebts] = useState<Record<string, boolean>>({});
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>("home");
  const [workspaceDensity, setWorkspaceDensity] =
    useState<WorkspaceDensity>("comfortable");
  const [netWorthAssetsInput, setNetWorthAssetsInput] = useState("");
  const [netWorthDebtsInput, setNetWorthDebtsInput] = useState("");
  const [newSavingsGoalName, setNewSavingsGoalName] = useState("");
  const [newSavingsGoalTarget, setNewSavingsGoalTarget] = useState("");
  const [newSavingsGoalBudgetTarget, setNewSavingsGoalBudgetTarget] = useState("");
  const [newSavingsGoalCreateBudgetRow, setNewSavingsGoalCreateBudgetRow] = useState(true);
  const [savingsGoalEdits, setSavingsGoalEdits] = useState<Record<string, string>>({});
  const [savingsAdjustmentInputs, setSavingsAdjustmentInputs] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "warning" | "info";
  } | null>(null);
  const [manualPaycheckDateInput, setManualPaycheckDateInput] = useState(
    formatInputDate(new Date())
  );
  const [manualPaycheckAmountInput, setManualPaycheckAmountInput] = useState("");

  function syncSavingsState(nextSavingsGoals: Savings[]) {
    setSavingsGoals(nextSavingsGoals);
    setSavingsGoalEdits((current) => {
      const next: Record<string, string> = {};
      nextSavingsGoals.forEach((goal) => {
        next[goal.id] = current[goal.id] ?? String(Number(goal.goal || 0));
      });
      return next;
    });
  }

  function pushToast(
    message: string,
    tone: "success" | "warning" | "info" = "success"
  ) {
    setToast({ message, tone });
  }

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      logSupabaseError("Failed to sign out", error);
      setSyncError(getErrorMessage(error));
      return;
    }

    router.push("/login");
  };

  const replaceBudgetAssignments = async (
    nextAssignments: Record<string, number>,
    uid: string,
    monthKey: string
  ) => {
    const { error: deleteError } = await supabase
      .from("budget_assignments")
      .delete()
      .eq("user_id", uid)
      .eq("month_key", monthKey);

    if (deleteError) {
      logSupabaseError("Failed to clear budget assignments", deleteError, {
        userId: uid,
        monthKey,
      });
      setSyncError(getErrorMessage(deleteError));
      return false;
    }

    const rows = Object.entries(nextAssignments)
      .filter(([, assigned]) => Number(assigned) > 0)
      .map(([item_key, assigned]) => ({
        user_id: uid,
        month_key: monthKey,
        item_key,
        assigned: Number(assigned),
      }));

    if (rows.length === 0) {
      return true;
    }

    const { error: insertError } = await supabase
      .from("budget_assignments")
      .insert(rows);

    if (insertError) {
      logSupabaseError("Failed to save budget assignments", insertError, {
        userId: uid,
        monthKey,
        count: rows.length,
      });
      setSyncError(getErrorMessage(insertError));
      return false;
    }

    return true;
  };

  const commitAssignedBudget = async (nextAssignments: Record<string, number>) => {
    setAssignedBudget(nextAssignments);

    if (!assignmentSyncReady || !userId) {
      return;
    }

    const monthKey = getCurrentMonthKey();
    const success = await replaceBudgetAssignments(nextAssignments, userId, monthKey);

    if (success) {
      setSyncError(null);
    }
  };

  const mapPaycheckSettingsRow = (row: PaycheckSettingsRow): PaycheckSettings => ({
    type: row.schedule_type,
    anchorDate: row.anchor_date || DEFAULT_PAYCHECK_SETTINGS.anchorDate,
    monthlyDay: row.monthly_day ? String(row.monthly_day) : DEFAULT_PAYCHECK_SETTINGS.monthlyDay,
    firstTwiceMonthlyDay: row.first_twice_monthly_day
      ? String(row.first_twice_monthly_day)
      : DEFAULT_PAYCHECK_SETTINGS.firstTwiceMonthlyDay,
    secondTwiceMonthlyDay: row.second_twice_monthly_day
      ? String(row.second_twice_monthly_day)
      : DEFAULT_PAYCHECK_SETTINGS.secondTwiceMonthlyDay,
  });

  const saveLinkedSavingsCategory = async ({
    savingsGoalName,
    linkedCategoryId = null,
    initialMonthlyTarget,
  }: {
    savingsGoalName: string;
    linkedCategoryId?: string | null;
    initialMonthlyTarget?: number;
  }) => {
    if (!userId) return null;

    const trimmedName = savingsGoalName.trim();
    if (!trimmedName) return null;

    if (linkedCategoryId) {
      const { data, error } = await supabase
        .from("budget_categories")
        .update({
          name: trimmedName,
          group_name: "Savings",
        })
        .eq("id", linkedCategoryId)
        .select()
        .single();

      if (error) {
        logSupabaseError("Failed to update linked savings budget category", error, {
          linkedCategoryId,
          name: trimmedName,
        });
        setSyncError(getErrorMessage(error));
        return null;
      }

      if (data) {
        setCategories((current) =>
          current.map((category) =>
            category.id === linkedCategoryId ? (data as BudgetCategory) : category
          )
        );
      }

      return data as BudgetCategory | null;
    }

    const duplicate = categories.find(
      (category) =>
        category.group_name === "Savings" &&
        category.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      return duplicate;
    }

    const nextPriority =
      categories.reduce((max, category) => Math.max(max, Number(category.priority || 0)), 0) + 1;

    const { data, error } = await supabase
      .from("budget_categories")
      .insert([
        {
          user_id: userId,
          name: trimmedName,
          group_name: "Savings",
          weekly_limit: 0,
          monthly_limit: Math.max(Number(initialMonthlyTarget || 0), 0),
          target_day: null,
          split_across_paychecks: false,
          priority: nextPriority,
          rollover: false,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to create linked savings budget category", error, {
        userId,
        name: trimmedName,
        monthly_limit: Math.max(Number(initialMonthlyTarget || 0), 0),
      });
      setSyncError(getErrorMessage(error));
      return null;
    }

    if (data) {
      setCategories((current) => [...current, data as BudgetCategory]);
    }

    return data as BudgetCategory | null;
  };

  const recordPaycheckReceipt = async ({
    receivedDate,
    amount: receivedAmount,
    expectedDate,
    sourceTransactionId = null,
    note = null,
  }: {
    receivedDate: string;
    amount?: number | null;
    expectedDate?: string | null;
    sourceTransactionId?: string | null;
    note?: string | null;
  }) => {
    if (!userId) return false;

    if (
      sourceTransactionId &&
      paycheckHistory.some((entry) => entry.source_transaction_id === sourceTransactionId)
    ) {
      return true;
    }

    const payload = {
      user_id: userId,
      received_date: receivedDate,
      amount:
        receivedAmount !== undefined && receivedAmount !== null
          ? Number(receivedAmount)
          : null,
      expected_date: expectedDate || null,
      source_transaction_id: sourceTransactionId,
      note,
    };

    const { data, error } = await supabase
      .from("paycheck_history")
      .insert(payload)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to record paycheck receipt", error, payload);
      setSyncError(getErrorMessage(error));
      return false;
    }

    if (data) {
      setPaycheckHistory((current) =>
        [data as PaycheckHistoryRow, ...current].sort(
          (a, b) =>
            new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
        )
      );
    }

    setSyncError(null);
    return true;
  };

  const savePaycheckSettings = async (settings = paycheckSettings) => {
    if (!userId) return;

    const payload = {
      user_id: userId,
      schedule_type: settings.type,
      anchor_date: settings.anchorDate || null,
      monthly_day: Number(settings.monthlyDay || 0) || null,
      first_twice_monthly_day: Number(settings.firstTwiceMonthlyDay || 0) || null,
      second_twice_monthly_day: Number(settings.secondTwiceMonthlyDay || 0) || null,
    };

    const { error } = await supabase
      .from("paycheck_settings")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      logSupabaseError("Failed to save paycheck settings", error, {
        userId,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    setSyncError(null);
    pushToast("Paycheck settings saved.");
  };

  const markPaycheckReceived = async () => {
    const amountValue =
      manualPaycheckAmountInput.trim().length > 0
        ? Number(manualPaycheckAmountInput)
        : null;

    const success = await recordPaycheckReceipt({
      receivedDate: manualPaycheckDateInput || formatInputDate(new Date()),
      amount: amountValue,
      expectedDate: nextPayday ? formatInputDate(nextPayday) : null,
      note: "Manual paycheck check-in",
    });

    if (!success) {
      return;
    }

    pushToast("Paycheck marked as received.");
    setManualPaycheckAmountInput("");
  };

  const saveMonthlyBudgetState = async (incomeValue: string, uid: string) => {
    const monthKey = getCurrentMonthKey();
    const { error } = await supabase.from("monthly_budget_state").upsert(
      {
        user_id: uid,
        month_key: monthKey,
        monthly_income: Number(incomeValue || 0),
      },
      { onConflict: "user_id,month_key" }
    );

    if (error) {
      logSupabaseError("Failed to save monthly budget state", error, {
        userId: uid,
        monthKey,
        monthlyIncome: Number(incomeValue || 0),
      });
      setSyncError(getErrorMessage(error));
      return false;
    }

    setSyncError(null);
    return true;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("money-os:income", monthlyIncomeInput || "0");
  }, [monthlyIncomeInput]);

  useEffect(() => {
    if (!monthlyBudgetSyncReady || !userId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveMonthlyBudgetState(monthlyIncomeInput, userId);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [monthlyBudgetSyncReady, monthlyIncomeInput, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = getPaycheckStorageKey(userId);
    const storedSettings = window.localStorage.getItem(storageKey);

    if (storedSettings) {
      const frame = window.requestAnimationFrame(() => {
        try {
          const parsed = JSON.parse(storedSettings) as Partial<PaycheckSettings>;
          setPaycheckSettings((current) => ({
            ...current,
            ...parsed,
          }));
        } catch (error) {
          logSupabaseError("Failed to parse paycheck settings", error, {
            storageKey,
          });
        }
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      getPaycheckStorageKey(userId),
      JSON.stringify(paycheckSettings)
    );
  }, [paycheckSettings, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedDensity = window.localStorage.getItem(
      getWorkspaceDensityStorageKey(userId)
    );

    if (
      storedDensity === "compact" ||
      storedDensity === "comfortable"
    ) {
      const frame = window.requestAnimationFrame(() => {
        setWorkspaceDensity(storedDensity);
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      getWorkspaceDensityStorageKey(userId),
      workspaceDensity
    );
  }, [userId, workspaceDensity]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        logSupabaseError("Failed to fetch authenticated user", userError);
        setSyncError(getErrorMessage(userError));
        setLoading(false);
        return;
      }

      if (!user) {
        router.push("/login");
        return;
      }

      const uid = user.id;
      setUserId(uid);

      const monthKey = getCurrentMonthKey();
      const [txRes, accountRes, categoryRes, debtRes, billRes, netWorthRes, assignmentRes, paycheckRes, monthlyBudgetRes, paycheckHistoryRes] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", { ascending: false }),

          supabase.from("accounts").select("*").eq("user_id", uid),

          supabase
            .from("budget_categories")
            .select("*")
            .eq("user_id", uid)
            .order("group_name", { ascending: true }),

          supabase.from("debts").select("*").eq("user_id", uid),

          supabase.from("recurring_bills").select("*").eq("user_id", uid),

          supabase
            .from("net_worth_snapshots")
            .select("*")
            .eq("user_id", uid)
            .order("snapshot_date", { ascending: false })
            .limit(8),

          supabase
            .from("budget_assignments")
            .select("item_key, assigned")
            .eq("user_id", uid)
            .eq("month_key", monthKey),

          supabase
            .from("paycheck_settings")
            .select("schedule_type, anchor_date, monthly_day, first_twice_monthly_day, second_twice_monthly_day")
            .eq("user_id", uid)
            .maybeSingle(),

          supabase
            .from("monthly_budget_state")
            .select("month_key, monthly_income")
            .eq("user_id", uid)
            .eq("month_key", monthKey)
            .maybeSingle(),

          supabase
            .from("paycheck_history")
            .select("*")
            .eq("user_id", uid)
            .order("received_date", { ascending: false })
            .limit(12),
        ]);

      const loadErrors = [
        txRes.error,
        accountRes.error,
        categoryRes.error,
        debtRes.error,
        billRes.error,
        netWorthRes.error,
        assignmentRes.error,
        paycheckRes.error,
        monthlyBudgetRes.error,
        paycheckHistoryRes.error,
      ].filter(Boolean);

      if (loadErrors.length > 0) {
        loadErrors.forEach((error, index) => {
          logSupabaseError(`Supabase load failed [${index}]`, error);
        });
        setSyncError(getErrorMessage(loadErrors[0]));
      } else {
        setSyncError(null);
      }

      setTransactions(txRes.data || []);
      setAccounts(accountRes.data || []);
      setCategories(categoryRes.data || []);
      setDebts(debtRes.data || []);
      syncExpandedDebtState(debtRes.data || []);
      setBills(billRes.data || []);
      const snapshotHistory = netWorthRes.data || [];
      setNetWorthHistory(snapshotHistory);
      setNetWorth(snapshotHistory[0] || null);
      setPaycheckHistory(paycheckHistoryRes.data || []);

      const remoteAssignments = Object.fromEntries(
        ((assignmentRes.data as BudgetAssignmentRow[] | null) || []).map((row) => [
          row.item_key,
          Number(row.assigned),
        ])
      );

      if (Object.keys(remoteAssignments).length > 0) {
        setAssignedBudget(remoteAssignments);
      } else if (typeof window !== "undefined") {
        try {
          const stored = window.localStorage.getItem(
            getBudgetAssignmentStorageKey(monthKey)
          );

          if (stored) {
            const localAssignments = JSON.parse(stored) as Record<string, number>;
            setAssignedBudget(localAssignments);
            await replaceBudgetAssignments(localAssignments, uid, monthKey);
            window.localStorage.removeItem(getBudgetAssignmentStorageKey(monthKey));
          }
        } catch (migrationError) {
          logSupabaseError("Failed to migrate local budget assignments", migrationError, {
            userId: uid,
            monthKey,
          });
        }
      }

      setAssignmentSyncReady(true);

      if (monthlyBudgetRes.data) {
        const monthlyBudgetRow = monthlyBudgetRes.data as MonthlyBudgetStateRow;
        setMonthlyIncomeInput(
          String(
            Number(monthlyBudgetRow.monthly_income ?? DEFAULT_MONTHLY_INCOME)
          )
        );
      } else if (typeof window !== "undefined") {
        const storedIncome = window.localStorage.getItem("money-os:income");

        if (storedIncome) {
          setMonthlyIncomeInput(storedIncome);
          await saveMonthlyBudgetState(storedIncome, uid);
        }
      }

      setMonthlyBudgetSyncReady(true);

      if (paycheckRes.data) {
        setPaycheckSettings(
          mapPaycheckSettingsRow(paycheckRes.data as PaycheckSettingsRow)
        );
      } else if (typeof window !== "undefined") {
        try {
          const storedSettings = window.localStorage.getItem(getPaycheckStorageKey(uid));

          if (storedSettings) {
            const parsed = JSON.parse(storedSettings) as Partial<PaycheckSettings>;
            const nextSettings = {
              ...DEFAULT_PAYCHECK_SETTINGS,
              ...parsed,
            };
            setPaycheckSettings(nextSettings);
            const { error: paycheckMigrationError } = await supabase
              .from("paycheck_settings")
              .upsert(
                {
                  user_id: uid,
                  schedule_type: nextSettings.type,
                  anchor_date: nextSettings.anchorDate || null,
                  monthly_day: Number(nextSettings.monthlyDay || 0) || null,
                  first_twice_monthly_day:
                    Number(nextSettings.firstTwiceMonthlyDay || 0) || null,
                  second_twice_monthly_day:
                    Number(nextSettings.secondTwiceMonthlyDay || 0) || null,
                },
                { onConflict: "user_id" }
              );

            if (paycheckMigrationError) {
              logSupabaseError(
                "Failed to migrate paycheck settings to Supabase",
                paycheckMigrationError,
                {
                  userId: uid,
                }
              );
            }
          }
        } catch (migrationError) {
          logSupabaseError("Failed to migrate paycheck settings", migrationError, {
            userId: uid,
          });
        }
      }

      setPaycheckSyncReady(true);

      const { data: savingsData, error: savingsError } = await supabase
        .from("savings")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (savingsError) {
        logSupabaseError("Failed to load savings", savingsError);
        setSyncError(getErrorMessage(savingsError));
        setLoading(false);
        return;
      }

      if (!savingsData || savingsData.length === 0) {
        const { data: newSavings, error: newSavingsError } = await supabase
          .from("savings")
          .insert([{ user_id: uid, name: "Emergency Fund", goal: 1000, current: 0, linked_category_id: null }])
          .select()
          .order("created_at", { ascending: true });

        if (newSavingsError) {
          logSupabaseError("Failed to create savings row", newSavingsError, {
            userId: uid,
          });
          setSyncError(getErrorMessage(newSavingsError));
        }

        syncSavingsState((newSavings as Savings[] | null) || []);
      } else {
        syncSavingsState((savingsData as Savings[]) || []);
      }

      setLoading(false);
    };

    init();
  }, [router]);

  function syncExpandedDebtState(nextDebts: Debt[]) {
    setExpandedDebts((current) => {
      const next: Record<string, boolean> = {};

      nextDebts.forEach((debt) => {
        next[debt.id] = current[debt.id] ?? false;
      });

      return next;
    });
  }

  const setupDefaults = async () => {
    if (!userId) return;

    if (categories.length === 0) {
      const { data, error } = await supabase
        .from("budget_categories")
        .insert(
          DEFAULT_CATEGORIES.map((cat, index) => ({
            ...cat,
            user_id: userId,
            priority: index + 1,
            rollover: false,
          }))
        )
        .select();

      if (error) {
        logSupabaseError("Failed to create default categories", error, {
          userId,
        });
        setSyncError(getErrorMessage(error));
        return;
      }

      setCategories(data || []);
    }

    if (bills.length === 0) {
      const { data, error } = await supabase
        .from("recurring_bills")
        .insert(DEFAULT_BILLS.map((bill) => ({ ...bill, user_id: userId })))
        .select();

      if (error) {
        logSupabaseError("Failed to create default bills", error, {
          userId,
        });
        setSyncError(getErrorMessage(error));
        return;
      }

      setBills(data || []);
    }

    if (accounts.length === 0) {
      const { data, error } = await supabase
        .from("accounts")
        .insert([
          {
            user_id: userId,
            name: "Checking",
            type: "checking",
            current_balance: 0,
          },
        ])
        .select();

      if (error) {
        logSupabaseError("Failed to create default account", error, {
          userId,
        });
        setSyncError(getErrorMessage(error));
        return;
      }

      setAccounts(data || []);
    }

    setSyncError(null);
  };

  const addTransaction = async () => {
    if (!amount || !userId) return;

    const normalizedAmount = Math.abs(Number(amount));
    const trimmedMerchant = transactionMerchant.trim();
    const trimmedMemo = transactionMemo.trim();
    const activeTransactionAccountId = transactionAccountId || accounts[0]?.id || "";

    const { data, error } = await supabase
      .from("transactions")
      .insert([
        {
          amount: normalizedAmount,
          category: selectedCategory,
          merchant: trimmedMerchant || null,
          memo: trimmedMemo || null,
          account_id: activeTransactionAccountId || null,
          transaction_date: transactionDateInput || null,
          transaction_type: transactionType,
          user_id: userId,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to add transaction", error, {
        userId,
        amount,
        selectedCategory,
        merchant: trimmedMerchant || null,
        memo: trimmedMemo || null,
        accountId: activeTransactionAccountId || null,
        transactionDate: transactionDateInput || null,
        transactionType,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      setTransactions([data, ...transactions]);
    }

    if (data && transactionType === "income" && transactionCountsAsPaycheck) {
      await recordPaycheckReceipt({
        receivedDate: transactionDateInput || formatInputDate(new Date()),
        amount: normalizedAmount,
        expectedDate: nextPayday ? formatInputDate(nextPayday) : null,
        sourceTransactionId: data.id,
        note: trimmedMerchant || "Income transaction",
      });
    }

    setSyncError(null);
    pushToast(
      transactionType === "income"
        ? "Income saved."
        : "Transaction saved."
    );
    setAmount("");
    setTransactionMerchant("");
    setTransactionMemo("");
    setTransactionDateInput(formatInputDate(new Date()));
    setTransactionType("expense");
    setTransactionCountsAsPaycheck(true);
  };

  const updateMainBalance = async () => {
    if (!userId || !bankBalanceInput) return;

    const existing = accounts[0];

    if (existing) {
      const { data, error } = await supabase
        .from("accounts")
        .update({ current_balance: Number(bankBalanceInput) })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        logSupabaseError("Failed to update balance", error, {
          accountId: existing.id,
          current_balance: Number(bankBalanceInput),
        });
        setSyncError(getErrorMessage(error));
        return;
      }

      if (data) setAccounts([data, ...accounts.slice(1)]);
    } else {
      const { data, error } = await supabase
        .from("accounts")
        .insert([
          {
            user_id: userId,
            name: "Checking",
            type: "checking",
            current_balance: Number(bankBalanceInput),
          },
        ])
        .select()
        .single();

      if (error) {
        logSupabaseError("Failed to create balance account", error, {
          userId,
          name: "Checking",
          type: "checking",
          current_balance: Number(bankBalanceInput),
        });
        setSyncError(getErrorMessage(error));
        return;
      }

      if (data) setAccounts([data]);
    }

    setSyncError(null);
    setBankBalanceInput("");
    pushToast("Bank balance updated.");
  };

  const updateSavings = async (savingsId: string, newAmount: number) => {
    const goalToUpdate = savingsGoals.find((goal) => goal.id === savingsId);
    if (!goalToUpdate) return;

    const { data, error } = await supabase
      .from("savings")
      .update({ current: newAmount })
      .eq("id", savingsId)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to update savings", error, {
        savingsId,
        current: newAmount,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      setSavingsGoals((current) =>
        current.map((goal) => (goal.id === savingsId ? (data as Savings) : goal))
      );
    }
    setSyncError(null);
    pushToast(`${goalToUpdate.name} updated.`);
  };

  const updateSavingsGoal = async (savingsId: string, newGoal: number, nextName?: string) => {
    const goalToUpdate = savingsGoals.find((goal) => goal.id === savingsId);
    if (!goalToUpdate) return;

    const trimmedName = nextName?.trim() || goalToUpdate.name;

    const { data, error } = await supabase
      .from("savings")
      .update({
        goal: newGoal,
        name: trimmedName,
      })
      .eq("id", savingsId)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to update savings goal", error, {
        savingsId,
        goal: newGoal,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      const typedData = data as Savings;
      if (typedData.linked_category_id || goalToUpdate.linked_category_id) {
        await saveLinkedSavingsCategory({
          savingsGoalName: trimmedName,
          linkedCategoryId:
            typedData.linked_category_id || goalToUpdate.linked_category_id || null,
        });
      }
      setSavingsGoals((current) =>
        current.map((goal) => (goal.id === savingsId ? typedData : goal))
      );
      setSavingsGoalEdits((current) => ({
        ...current,
        [savingsId]: String(Number(typedData.goal || 0)),
      }));
    }
    setSyncError(null);
    pushToast(`${goalToUpdate.name} goal saved.`);
  };

  const addSavingsGoal = async () => {
    if (!userId || !newSavingsGoalName.trim()) return;

    const trimmedName = newSavingsGoalName.trim();
    const goalAmount = Math.max(Number(newSavingsGoalTarget || 0), 0);
    const budgetTargetAmount = Math.max(Number(newSavingsGoalBudgetTarget || 0), 0);

    const { data, error } = await supabase
      .from("savings")
      .insert([
        {
          user_id: userId,
          name: trimmedName,
          goal: goalAmount,
          current: 0,
          linked_category_id: null,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to add savings goal", error, {
        userId,
        name: trimmedName,
        goal: goalAmount,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      let typedData = data as Savings;

      if (newSavingsGoalCreateBudgetRow) {
        const linkedCategory = await saveLinkedSavingsCategory({
          savingsGoalName: trimmedName,
          initialMonthlyTarget: budgetTargetAmount,
        });

        if (linkedCategory) {
          const { data: linkedSavingsData, error: linkError } = await supabase
            .from("savings")
            .update({ linked_category_id: linkedCategory.id })
            .eq("id", typedData.id)
            .select()
            .single();

          if (linkError) {
            logSupabaseError("Failed to link savings goal to budget category", linkError, {
              savingsId: typedData.id,
              linkedCategoryId: linkedCategory.id,
            });
            setSyncError(getErrorMessage(linkError));
          } else if (linkedSavingsData) {
            typedData = linkedSavingsData as Savings;
          }
        }
      }

      setSavingsGoals((current) => [...current, typedData]);
      setSavingsGoalEdits((current) => ({
        ...current,
        [typedData.id]: String(Number(typedData.goal || 0)),
      }));
    }

    setNewSavingsGoalName("");
    setNewSavingsGoalTarget("");
    setNewSavingsGoalBudgetTarget("");
    setNewSavingsGoalCreateBudgetRow(true);
    setSyncError(null);
    pushToast("Savings goal added.");
  };

  const applySavingsAdjustment = async (savingsId: string) => {
    const goalToUpdate = savingsGoals.find((goal) => goal.id === savingsId);
    if (!goalToUpdate) return;
    const adjustment = Number(savingsAdjustmentInputs[savingsId] || 0);
    const nextAmount = Math.max(Number(goalToUpdate.current || 0) + adjustment, 0);

    await updateSavings(savingsId, nextAmount);
    setSavingsAdjustmentInputs((current) => ({
      ...current,
      [savingsId]: "",
    }));
  };

  const resetSavingsBalance = async (savingsId: string) => {
    await updateSavings(savingsId, 0);
    setSavingsAdjustmentInputs((current) => ({
      ...current,
      [savingsId]: "",
    }));
  };

  const saveNetWorthSnapshot = async () => {
    if (!userId) return;

    const assets = Number(netWorthAssetsInput || 0);
    const debtAmount = Number(netWorthDebtsInput || 0);
    const nextSnapshotDate = formatInputDate(new Date());

    const { data, error } = await supabase
      .from("net_worth_snapshots")
      .insert([
        {
          user_id: userId,
          assets,
          debts: debtAmount,
          net_worth: assets - debtAmount,
          snapshot_date: nextSnapshotDate,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to save net worth snapshot", error, {
        userId,
        assets,
        debts: debtAmount,
        snapshot_date: nextSnapshotDate,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      const nextHistory = [data, ...netWorthHistory]
        .sort(
          (a, b) =>
            new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
        )
        .slice(0, 8);
      setNetWorthHistory(nextHistory);
      setNetWorth(nextHistory[0] || data);
    }

    setNetWorthAssetsInput("");
    setNetWorthDebtsInput("");
    setSyncError(null);
    pushToast("Net worth snapshot saved.");
  };

  const addDebt = async () => {
    if (!userId) return;

    const trimmedName = newDebtName.trim();
    const balance = Number(newDebtBalance || 0);
    const interest = Number(newDebtInterest || 0);
    const minPayment = Number(newDebtMinPayment || 0);

    if (!trimmedName) {
      setSyncError("Debt name is required.");
      return;
    }

    if (balance <= 0) {
      setSyncError("Debt balance must be greater than zero.");
      return;
    }

    const { data, error } = await supabase
      .from("debts")
      .insert([
        {
          user_id: userId,
          name: trimmedName,
          balance,
          interest,
          min_payment: minPayment,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to add debt", error, {
        userId,
        name: trimmedName,
        balance,
        interest,
        min_payment: minPayment,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      const nextDebts = [...debts, data];
      setDebts(nextDebts);
      syncExpandedDebtState(nextDebts);
    }
    setNewDebtName("");
    setNewDebtBalance("");
    setNewDebtInterest("");
    setNewDebtMinPayment("");
    setSyncError(null);
    pushToast("Debt saved.");
  };

  const loadDebtPreset = async () => {
    if (!userId) return;

    const existingNames = new Set(
      debts.map((debt) => debt.name.trim().toLowerCase())
    );
    const rowsToInsert = USER_DEBT_PRESET.filter(
      (debt) => !existingNames.has(debt.name.trim().toLowerCase())
    ).map((debt) => ({
      ...debt,
      user_id: userId,
    }));

    if (rowsToInsert.length === 0) {
      setSyncError("Those preset debts are already in your account.");
      return;
    }

    const { data, error } = await supabase
      .from("debts")
      .insert(rowsToInsert)
      .select();

    if (error) {
      logSupabaseError("Failed to load debt preset", error, {
        userId,
        count: rowsToInsert.length,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      const nextDebts = [...debts, ...data];
      setDebts(nextDebts);
      syncExpandedDebtState(nextDebts);
    }

    setSyncError(null);
    pushToast("Debt preset loaded.");
  };

  const updateDebtField = (
    debtId: string,
    field: keyof Pick<Debt, "name" | "balance" | "interest" | "min_payment">,
    value: string
  ) => {
    setDebts((currentDebts) =>
      currentDebts.map((debt) =>
        debt.id === debtId
          ? {
              ...debt,
              [field]:
                field === "name" ? value : Number(value === "" ? 0 : value),
            }
          : debt
      )
    );
  };

  const saveDebt = async (debt: Debt) => {
    const trimmedName = debt.name.trim();

    if (!trimmedName) {
      setSyncError("Debt name is required.");
      return;
    }

    const { data, error } = await supabase
      .from("debts")
      .update({
        name: trimmedName,
        balance: Number(debt.balance),
        interest: Number(debt.interest),
        min_payment: Number(debt.min_payment),
      })
      .eq("id", debt.id)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to save debt", error, {
        debtId: debt.id,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      setDebts((currentDebts) => {
        const nextDebts = currentDebts.map((currentDebt) =>
          currentDebt.id === data.id ? data : currentDebt
        );
        syncExpandedDebtState(nextDebts);
        return nextDebts;
      });
    }

    setSyncError(null);
    pushToast("Debt updated.");
  };

  const deleteDebt = async (debtId: string) => {
    const { error } = await supabase.from("debts").delete().eq("id", debtId);

    if (error) {
      logSupabaseError("Failed to delete debt", error, {
        debtId,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    setDebts((currentDebts) => {
      const nextDebts = currentDebts.filter((debt) => debt.id !== debtId);
      syncExpandedDebtState(nextDebts);
      return nextDebts;
    });
    setSyncError(null);
    pushToast("Debt deleted.", "info");
  };

  const updateBillField = (
    billId: string,
    field: keyof Pick<RecurringBill, "name" | "amount" | "due_day" | "category" | "counts_toward_available_cash" | "split_across_paychecks">,
    value: string | boolean
  ) => {
    setBills((currentBills) =>
      currentBills.map((bill) =>
        bill.id === billId
          ? {
              ...bill,
              [field]:
                field === "name" || field === "category"
                  ? value
                  : field === "counts_toward_available_cash" ||
                      field === "split_across_paychecks"
                    ? Boolean(value)
                  : Number(value === "" ? 0 : value),
            }
          : bill
      )
    );
  };

  const saveBill = async (bill: RecurringBill) => {
    const { data, error } = await supabase
      .from("recurring_bills")
      .update({
        name: bill.name.trim(),
        amount: Number(bill.amount),
        due_day: Number(bill.due_day),
        category: bill.category.trim(),
        counts_toward_available_cash: bill.counts_toward_available_cash ?? true,
        split_across_paychecks: bill.split_across_paychecks ?? false,
      })
      .eq("id", bill.id)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to save recurring bill", error, {
        billId: bill.id,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      setBills((currentBills) =>
        currentBills.map((currentBill) =>
          currentBill.id === data.id ? data : currentBill
        )
      );
    }

    setSyncError(null);
    pushToast("Recurring bill saved.");
  };

  const addRecurringBill = async () => {
    if (!userId) return;

    const trimmedName = newBillName.trim();
    const trimmedCategory = newBillCategory.trim() || trimmedName;
    const amount = Number(newBillAmount || 0);
    const dueDay = Number(newBillDueDay || 0);

    if (!trimmedName) {
      setSyncError("Recurring bill name is required.");
      return;
    }

    if (dueDay < 1 || dueDay > 31) {
      setSyncError("Recurring bill due day must be between 1 and 31.");
      return;
    }

    const { data, error } = await supabase
      .from("recurring_bills")
      .insert([
        {
          user_id: userId,
          name: trimmedName,
          amount,
          due_day: dueDay,
          category: trimmedCategory,
          counts_toward_available_cash: true,
          split_across_paychecks: newBillSplitAcrossPaychecks,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to add recurring bill", error, {
        userId,
        name: trimmedName,
        amount,
        due_day: dueDay,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      setBills([...bills, data]);
    }

    setNewBillName("");
    setNewBillAmount("");
    setNewBillDueDay("");
    setNewBillSplitAcrossPaychecks(false);
    setSyncError(null);
    pushToast("Recurring bill added.");
  };

  const updateCategoryField = (
    categoryId: string,
    field: keyof Pick<BudgetCategory, "name" | "group_name" | "weekly_limit" | "monthly_limit" | "target_day" | "split_across_paychecks">,
    value: string | boolean
  ) => {
    setCategories((currentCategories) =>
      currentCategories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              [field]:
                field === "name" || field === "group_name"
                  ? value
                  : field === "split_across_paychecks"
                    ? Boolean(value)
                  : field === "target_day"
                    ? (value === "" ? null : Number(value))
                    : Number(value === "" ? 0 : value),
            }
          : category
      )
    );
  };

  const saveCategory = async (category: BudgetCategory) => {
    const { data, error } = await supabase
      .from("budget_categories")
      .update({
        name: category.name.trim(),
        group_name: category.group_name.trim(),
        weekly_limit: Number(category.weekly_limit),
        monthly_limit: Number(category.monthly_limit),
        target_day: category.target_day ? Number(category.target_day) : null,
        split_across_paychecks: category.split_across_paychecks ?? false,
      })
      .eq("id", category.id)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to save budget category", error, {
        categoryId: category.id,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      setCategories((currentCategories) =>
        currentCategories.map((currentCategory) =>
          currentCategory.id === data.id ? data : currentCategory
        )
      );
      setSelectedCategory((currentSelected) =>
        currentSelected === category.name ? data.name : currentSelected
      );
    }

    setSyncError(null);
    pushToast("Category saved.");
  };

  const updateBudgetItemTarget = (itemKey: string, value: string) => {
    const amount = Math.max(0, Number(value || 0));

    if (itemKey.startsWith("bill:")) {
      const billId = itemKey.replace("bill:", "");
      setBills((currentBills) =>
        currentBills.map((bill) =>
          bill.id === billId
            ? {
                ...bill,
                amount,
              }
            : bill
        )
      );
      return;
    }

    const categoryId = itemKey.replace("category:", "");
    setCategories((currentCategories) =>
      currentCategories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              monthly_limit: amount,
            }
          : category
      )
    );
  };

  const saveBudgetItemTarget = async (itemKey: string) => {
    if (itemKey.startsWith("bill:")) {
      const billId = itemKey.replace("bill:", "");
      const bill = bills.find((currentBill) => currentBill.id === billId);
      if (bill) {
        await saveBill(bill);
      }
      return;
    }

    const categoryId = itemKey.replace("category:", "");
    const category = categories.find((currentCategory) => currentCategory.id === categoryId);
    if (category) {
      await saveCategory(category);
    }
  };

  const updateAssignedBudget = (itemKey: string, value: string) => {
    const amount = Math.max(0, Number(value || 0));
    const nextAssignments = {
      ...assignedBudget,
      [itemKey]: amount,
    };

    void commitAssignedBudget(nextAssignments);
  };

  const toggleDebtExpanded = (debtId: string) => {
    setExpandedDebts((current) => ({
      ...current,
      [debtId]: !current[debtId],
    }));
  };

  const trimmedNewCategoryName = newCategoryName.trim();
  const trimmedNewCategoryGroup = newCategoryGroup.trim() || "Flexible";
  const categoryNameExists = categories.some(
    (category) => category.name.toLowerCase() === trimmedNewCategoryName.toLowerCase()
  );
  const weeklyLimitValue = Number(newCategoryWeeklyLimit || 0);
  const monthlyLimitValue = Number(newCategoryMonthlyLimit || 0);
  const categoryTargetDayValue = newCategoryTargetDay === "" ? null : Number(newCategoryTargetDay);
  const categoryFormError = !trimmedNewCategoryName
    ? "Category name is required."
    : categoryNameExists
      ? "That category already exists."
      : weeklyLimitValue < 0 || monthlyLimitValue < 0
        ? "Weekly and monthly limits must be zero or higher."
        : categoryTargetDayValue !== null &&
            (Number.isNaN(categoryTargetDayValue) ||
              categoryTargetDayValue < 1 ||
              categoryTargetDayValue > 31)
          ? "Target day must be between 1 and 31."
        : null;
  const canSubmitCategory = !categorySubmitting && !categoryFormError;

  const addCategory = async () => {
    if (!userId) return;
    if (categoryFormError) {
      setCategoryFormMessage(categoryFormError);
      setSyncError(categoryFormError);
      return;
    }

    setCategorySubmitting(true);
    setCategoryFormMessage(null);

    const { data, error } = await supabase
      .from("budget_categories")
      .insert([
        {
          user_id: userId,
          name: trimmedNewCategoryName,
          group_name: trimmedNewCategoryGroup,
          weekly_limit: weeklyLimitValue,
          monthly_limit: monthlyLimitValue,
          target_day: categoryTargetDayValue,
          split_across_paychecks: newCategorySplitAcrossPaychecks,
          priority: categories.length + 1,
          rollover: false,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to add category", error, {
        userId,
        name: trimmedNewCategoryName,
        group_name: trimmedNewCategoryGroup,
        weekly_limit: weeklyLimitValue,
        monthly_limit: monthlyLimitValue,
        target_day: categoryTargetDayValue,
        split_across_paychecks: newCategorySplitAcrossPaychecks,
      });
      setCategorySubmitting(false);
      setCategoryFormMessage(getErrorMessage(error));
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) {
      setCategories([...categories, data]);
      setSelectedCategory(data.name);
    }

    setNewCategoryName("");
    setNewCategoryGroup("Flexible");
    setNewCategoryWeeklyLimit("");
    setNewCategoryMonthlyLimit("");
    setNewCategoryTargetDay("");
    setNewCategorySplitAcrossPaychecks(false);
    setCategoryFormMessage(`Saved ${data?.name || "category"}.`);
    setCategorySubmitting(false);
    setSyncError(null);
    pushToast("Budget category added.");
  };

  const now = new Date();

  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - now.getDay());

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const weeklyTransactions = transactions.filter(
    (t) => getTransactionDate(t) >= startOfWeek
  );

  const monthlyTransactions = transactions.filter(
    (t) => getTransactionDate(t) >= startOfMonth
  );

  const weeklyBudgetTotal = categories.reduce(
    (sum, cat) => sum + Number(cat.weekly_limit || 0),
    0
  );

  const monthlyBudgetTotal = categories.reduce(
    (sum, cat) => sum + Number(cat.monthly_limit || 0),
    0
  );

  const weeklySpentTotal = weeklyTransactions.reduce(
    (sum, tx) => sum + getTransactionExpenseAmount(tx),
    0
  );

  const monthlySpentTotal = monthlyTransactions.reduce(
    (sum, tx) => sum + getTransactionExpenseAmount(tx),
    0
  );
  const monthlyIncome = Number(monthlyIncomeInput || 0);
  const latestReceivedPaycheck = paycheckHistory[0] || null;
  const effectivePaycheckSettings = getEffectivePaycheckSettings(
    paycheckSettings,
    latestReceivedPaycheck
  );
  const receivedPaycheckToday = Boolean(
    latestReceivedPaycheck &&
      startOfDay(new Date(latestReceivedPaycheck.received_date)).getTime() ===
        startOfDay(now).getTime()
  );
  const nextPayday = getNextPayday(
    effectivePaycheckSettings,
    now,
    receivedPaycheckToday
  );
  const daysUntilNextPayday = nextPayday ? diffInDays(now, nextPayday) : null;

  const currentBankBalance = accounts[0]?.current_balance || 0;
  const activeTransactionAccountId = transactionAccountId || accounts[0]?.id || "";

  const billsReservedForAvailableCash = bills
    .filter(
      (bill) => !bill.is_paid && (bill.counts_toward_available_cash ?? true)
    )
    .reduce((sum, bill) => {
      const dueDate = getNextDueDate(Number(bill.due_day || 1), now);
      const reserveAmount = getCurrentPaycheckReserveAmount(
        Number(bill.amount || 0),
        dueDate,
        effectivePaycheckSettings,
        now,
        nextPayday,
        bill.split_across_paychecks ?? false,
        receivedPaycheckToday
      );

      return sum + reserveAmount;
    }, 0);

  const protectedBuffer = 50;

  const availableCash =
    currentBankBalance - billsReservedForAvailableCash - protectedBuffer;

  const totalDebt = debts.reduce((sum, debt) => sum + Number(debt.balance), 0);

  const totalSavingsCurrent = savingsGoals.reduce(
    (sum, goal) => sum + Number(goal.current || 0),
    0
  );
  const totalSavingsGoal = savingsGoals.reduce(
    (sum, goal) => sum + Number(goal.goal || 0),
    0
  );

  const categoryRows = categories.map((cat) => {
    const weeklySpent = weeklyTransactions
      .filter((tx) => tx.category === cat.name)
      .reduce((sum, tx) => sum + getTransactionExpenseAmount(tx), 0);

    const monthlySpent = monthlyTransactions
      .filter((tx) => tx.category === cat.name)
      .reduce((sum, tx) => sum + getTransactionExpenseAmount(tx), 0);

    const weeklyRemaining = Number(cat.weekly_limit) - weeklySpent;
    const monthlyRemaining = Number(cat.monthly_limit) - monthlySpent;

    const weeklyPercent =
      Number(cat.weekly_limit) > 0
        ? (weeklySpent / Number(cat.weekly_limit)) * 100
        : 0;

    let status = "SAFE";
    if (weeklyPercent >= 100) status = "STOP";
    else if (weeklyPercent >= 80) status = "CAUTION";

    return {
      ...cat,
      weeklySpent,
      monthlySpent,
      weeklyRemaining,
      monthlyRemaining,
      weeklyPercent,
      status,
    };
  });

  const overspendingDefense = categoryRows
    .map((cat) => {
      const categoryName = `${cat.name} ${cat.group_name}`.toLowerCase();
      const keywordMatch = OVESPENDING_KEYWORDS.some((keyword) =>
        categoryName.includes(keyword)
      );
      const weeklyRisk =
        Number(cat.weekly_limit || 0) > 0
          ? Number(cat.weeklySpent || 0) / Number(cat.weekly_limit || 1)
          : 0;
      const monthlyRisk =
        Number(cat.monthly_limit || 0) > 0
          ? Number(cat.monthlySpent || 0) / Number(cat.monthly_limit || 1)
          : 0;
      const monthlyPaceOverrun =
        Number(cat.monthly_limit || 0) > 0
          ? Number(cat.monthlySpent || 0) -
            (Number(cat.monthly_limit || 0) * now.getDate()) /
              Math.max(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), 1)
          : 0;
      const riskScore =
        (keywordMatch ? 1.25 : 0) +
        weeklyRisk * 1.4 +
        monthlyRisk +
        (monthlyPaceOverrun > 0 ? 0.4 : 0);

      let alert = "Watching";
      if (cat.weeklyRemaining < 0 || cat.monthlyRemaining < 0) alert = "Over";
      else if (weeklyRisk >= 1 || monthlyRisk >= 1) alert = "Stop";
      else if (weeklyRisk >= 0.85 || monthlyRisk >= 0.8 || monthlyPaceOverrun > 0) alert = "Caution";

      return {
        ...cat,
        keywordMatch,
        weeklyRisk,
        monthlyRisk,
        monthlyPaceOverrun,
        riskScore,
        alert,
      };
    })
    .filter(
      (cat) =>
        cat.keywordMatch ||
        cat.group_name === "Overspending Defense" ||
        cat.weeklyRisk >= 0.6 ||
        cat.monthlyRisk >= 0.6
    )
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);

  const merchantHistory = useMemo(() => {
    const history = new Map<
      string,
      {
        categoryCounts: Record<string, number>;
        lastAccountId: string | null;
        transactions: Transaction[];
      }
    >();

    transactions.forEach((transaction) => {
      const normalizedMerchant = normalizeMerchantName(transaction.merchant);
      if (!normalizedMerchant) return;

      const current = history.get(normalizedMerchant) || {
        categoryCounts: {},
        lastAccountId: null,
        transactions: [],
      };

      current.transactions.push(transaction);
      current.lastAccountId = transaction.account_id || current.lastAccountId;
      current.categoryCounts[transaction.category] =
        (current.categoryCounts[transaction.category] || 0) + 1;

      history.set(normalizedMerchant, current);
    });

    return history;
  }, [transactions]);

  const merchantSuggestion = useMemo(() => {
    const normalizedMerchant = normalizeMerchantName(transactionMerchant);
    if (!normalizedMerchant) return null;

    const history = merchantHistory.get(normalizedMerchant);
    if (!history) return null;

    const topCategory =
      Object.entries(history.categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      null;

    return {
      category: topCategory,
      accountId: history.lastAccountId,
      cadence: detectRecurringCadence(history.transactions),
      count: history.transactions.length,
    };
  }, [merchantHistory, transactionMerchant]);

  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const day = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index)));
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);
    const spent = transactions
      .filter((tx) => {
        const txDate = getTransactionDate(tx);
        return txDate >= day && txDate < nextDay;
      })
      .reduce((sum, tx) => sum + getTransactionExpenseAmount(tx), 0);

    return {
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      spent,
    };
  });

  const maxDailySpend = Math.max(...lastSevenDays.map((day) => day.spent), 1);
  const netWorthChart = [...netWorthHistory].reverse();
  const accountBalanceTrend = lastSevenDays.map((day) => {
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - lastSevenDays.findIndex((entry) => entry.label === day.label)) + 1);
    const spendingAfterDay = transactions
      .filter((tx) => getTransactionDate(tx) >= dayEnd)
      .reduce((sum, tx) => sum + getTransactionSignedAmount(tx), 0);

    return {
      ...day,
      balance: currentBankBalance - spendingAfterDay,
    };
  });
  const maxBalanceTrend = Math.max(
    ...accountBalanceTrend.map((day) => Math.abs(day.balance)),
    1
  );
  const categoryBreakdown = categoryRows
    .filter((cat) => cat.monthlySpent > 0)
    .sort((a, b) => b.monthlySpent - a.monthlySpent)
    .slice(0, 6);
  const maxCategoryBreakdown = Math.max(
    ...categoryBreakdown.map((cat) => Number(cat.monthlySpent || 0)),
    1
  );

  const totalMinimumDebtPayment = debts.reduce(
    (sum, debt) => sum + Number(debt.min_payment || 0),
    0
  );
  const fixedBillsTotal = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const monthlyPlannedGap = monthlyIncome - fixedBillsTotal;
  const billBudgetItems = bills
    .map((bill) => {
      const key = `bill:${bill.id}`;
      const target = Number(bill.amount || 0);
      const assigned = Number(assignedBudget[key] || 0);
      const dueDate = getNextDueDate(Number(bill.due_day || 1), now);
      const reserveAmount = getCurrentPaycheckReserveAmount(
        target,
        dueDate,
        effectivePaycheckSettings,
        now,
        nextPayday,
        bill.split_across_paychecks ?? false,
        receivedPaycheckToday
      );
      const isSplitBill =
        (bill.split_across_paychecks ?? false) && reserveAmount > 0 && reserveAmount < target;

      return {
        key,
        group: "Bills",
        name: bill.name,
        target,
        assigned,
        reserveAmount,
        dueDate,
        activity: 0,
        available: assigned,
        needed: Math.max(target - assigned, 0),
        detail:
          isSplitBill
            ? `${formatCurrency(reserveAmount)} to set aside this paycheck • ${formatCurrency(Math.max(target - assigned, 0))} total still needed by the ${bill.due_day}${getDaySuffix(Number(bill.due_day))}`
            : target > 0
            ? `${formatCurrency(Math.max(target - assigned, 0))} more needed by the ${bill.due_day}${getDaySuffix(Number(bill.due_day))}`
            : `No target set for the ${bill.due_day}${getDaySuffix(Number(bill.due_day))} due date.`,
        sortOrder: Number(bill.due_day || 99),
      };
    });

  const categoryBudgetItems = categories
    .map((category) => {
      const key = `category:${category.id}`;
      const target = Number(category.monthly_limit || 0);
      const assigned = Number(assignedBudget[key] || 0);
      const matchedCategoryRow = categoryRows.find((row) => row.id === category.id);
      const activity = Number(matchedCategoryRow?.monthlySpent || 0);
      const targetDate =
        category.target_day && category.target_day > 0
          ? getNextDueDate(Number(category.target_day), now)
          : null;
      const reserveAmount =
        (category.split_across_paychecks ?? false) && targetDate
          ? getCurrentPaycheckReserveAmount(
              target,
              targetDate,
              effectivePaycheckSettings,
              now,
              nextPayday,
              category.split_across_paychecks ?? false,
              receivedPaycheckToday
            )
          : target;
      const reservesBeforePayday =
        Boolean(targetDate && nextPayday && targetDate <= nextPayday) ||
        category.group_name === "Savings" ||
        ((category.split_across_paychecks ?? false) && reserveAmount > 0);

      return {
        key,
        group: category.group_name || "Flexible",
        name: category.name,
        target,
        assigned,
        targetDay: category.target_day ?? null,
        targetDate,
        reserveAmount,
        reservesBeforePayday,
        activity,
        available: assigned - activity,
        needed: Math.max(target - assigned, 0),
        detail:
          (category.split_across_paychecks ?? false) &&
          category.target_day &&
          reserveAmount > 0 &&
          reserveAmount < target
            ? `${formatCurrency(reserveAmount)} to set aside this paycheck • ${formatCurrency(Math.max(target - assigned, 0))} total still needed by the ${category.target_day}${getDaySuffix(Number(category.target_day))}`
            : category.target_day && category.target_day > 0
            ? `${formatCurrency(Math.max(target - assigned, 0))} more needed by the ${category.target_day}${getDaySuffix(Number(category.target_day))}`
            : `${formatCurrency(Math.max(target - assigned, 0))} more needed this month`,
        sortOrder: Number(category.priority || 999),
      };
    })
    .filter((item) => item.target > 0);

  const zeroBasedGroups = [
    {
      name: "Bills",
      items: billBudgetItems.sort((a, b) => a.sortOrder - b.sortOrder),
    },
    ...Array.from(new Set(categoryBudgetItems.map((item) => item.group))).map((group) => ({
      name: group,
      items: categoryBudgetItems
        .filter((item) => item.group === group)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    })),
  ].filter((group) => group.items.length > 0);

  const assignedTotal = [...billBudgetItems, ...categoryBudgetItems].reduce(
    (sum, item) => sum + item.assigned,
    0
  );
  const readyToAssign = monthlyIncome - assignedTotal;
  const underfundedTotal = [...billBudgetItems, ...categoryBudgetItems].reduce(
    (sum, item) => sum + item.needed,
    0
  );
  const spendingCategoryRows = categoryRows.filter(
    (cat) =>
      cat.group_name !== "Fixed Bills" &&
      cat.group_name !== "Debt" &&
      cat.group_name !== "Savings"
  );
  const daysRemainingInMonth = getDaysRemainingInMonth(now);
  const weeksRemainingInMonth = Math.max(daysRemainingInMonth / 7, 1);
  const fundedSpendingRemaining = spendingCategoryRows.reduce((sum, cat) => {
    const assigned = Number(assignedBudget[`category:${cat.id}`] || 0);
    const fundedTarget = assigned > 0 ? assigned : Number(cat.monthly_limit || 0);
    const remaining = Math.max(fundedTarget - cat.monthlySpent, 0);
    return sum + remaining;
  }, 0);
  const assignedGoalReserve = categoryBudgetItems.reduce((sum, item) => {
    const matchedCategory = categories.find((category) => category.id === item.key.replace("category:", ""));
    const nextTargetDate =
      matchedCategory?.target_day && nextPayday
        ? getNextDueDate(Number(matchedCategory.target_day), now)
        : null;

    if (item.group === "Savings") {
      if (!matchedCategory?.target_day) {
        return sum + Math.max(item.assigned, 0);
      }

      return nextTargetDate && nextPayday && nextTargetDate <= nextPayday
        ? sum + Math.max(item.assigned, 0)
        : sum;
    }

    if (
      matchedCategory?.target_day &&
      item.group !== "Debt" &&
      item.group !== "Fixed Bills" &&
      nextPayday &&
      nextTargetDate &&
      nextTargetDate <= nextPayday
    ) {
      return sum + Math.max(item.assigned, 0);
    }

    return sum;
  }, 0);
  const upcomingBillsBeforePayday = billBudgetItems.filter((bill) => {
    const matchedBill = bills.find((item) => `bill:${item.id}` === bill.key);
    if (!matchedBill || matchedBill.is_paid) return false;
    if (!(matchedBill.counts_toward_available_cash ?? true)) {
      return false;
    }

    return Number(bill.reserveAmount || 0) > 0;
  });
  const upcomingBillsBeforePaydayTotal = upcomingBillsBeforePayday.reduce(
    (sum, bill) => sum + Number(bill.reserveAmount || bill.target || 0),
    0
  );
  const cashReservedUntilPayday =
    upcomingBillsBeforePaydayTotal + assignedGoalReserve + protectedBuffer;
  const flexibleCashNow = currentBankBalance - cashReservedUntilPayday;
  const cashAvailableUntilPayday = Math.max(flexibleCashNow, 0);
  const daysUntilPaydayWindow = Math.max(daysUntilNextPayday ?? getDaysRemainingInMonth(now), 1);
  const dailyCashAllowance = cashAvailableUntilPayday / daysUntilPaydayWindow;
  const dailyFundedAllowance = fundedSpendingRemaining / daysUntilPaydayWindow;
  const dailyUnassignedAllowance = Math.max(readyToAssign, 0) / daysUntilPaydayWindow;
  const dailySafeToSpendBase = Math.min(
    dailyCashAllowance,
    dailyFundedAllowance + dailyUnassignedAllowance
  );
  const weeklyFundedSpendAllowance = fundedSpendingRemaining / weeksRemainingInMonth;
  const weeklyBudgetCapRemaining = spendingCategoryRows.reduce(
    (sum, cat) => sum + Math.max(Number(cat.weekly_limit || 0) - cat.weeklySpent, 0),
    0
  );
  const daysRemainingThisWeek = Math.max(6 - now.getDay() + 1, 1);
  const safeThisWeek = Math.min(
    dailySafeToSpendBase * daysRemainingThisWeek,
    weeklyFundedSpendAllowance,
    weeklyBudgetCapRemaining,
    cashAvailableUntilPayday
  );
  const dailySafeToSpend = Math.min(dailySafeToSpendBase, safeThisWeek);
  const safeToSpend = Math.min(
    safeThisWeek,
    Math.max(availableCash, 0)
  );
  const safeDailyPace = dailySafeToSpend;
  const nextFriday = new Date(now);
  nextFriday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7));
  const daysUntilFriday = Math.max(diffInDays(now, nextFriday), 1);
  const safeThroughFriday = Math.min(
    dailySafeToSpend * daysUntilFriday,
    fundedSpendingRemaining,
    cashAvailableUntilPayday
  );
  const fridayNumberAfterPlanned = Math.max(
    safeThroughFriday - Number(planned || 0),
    0
  );
  const cashRunwayDays =
    safeDailyPace > 0
      ? Math.max(Math.floor(cashAvailableUntilPayday / safeDailyPace), 0)
      : cashAvailableUntilPayday > 0
        ? daysUntilPaydayWindow
        : 0;
  const cashCoversUntilPayday = currentBankBalance >= cashReservedUntilPayday;
  const safeToSpendStatus =
    safeToSpend <= 0
      ? "Overspending risk 🚨"
      : `${formatCurrency(safeDailyPace)} safe daily pace • ${formatCurrency(flexibleCashNow)} flexible cash now • ${formatCurrency(safeThisWeek)} safe this week`;
  const cashTimeline = [...upcomingBillsBeforePayday]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((bill, index, allBills) => {
      const matchedBill = bills.find((item) => `bill:${item.id}` === bill.key);
      const runningReserved = allBills
        .slice(0, index + 1)
        .reduce((sum, currentBill) => sum + currentBill.target, 0);
      const postBillCash = currentBankBalance - runningReserved - protectedBuffer;

      return {
        ...bill,
        dueLabel: matchedBill
          ? getNextDueDate(Number(matchedBill.due_day || 1), now).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "--",
        reserveLabel:
          Number(bill.reserveAmount || 0) > 0 &&
          Number(bill.reserveAmount || 0) < Number(bill.target || 0)
            ? `${formatCurrency(Number(bill.reserveAmount || 0))} reserved this paycheck`
            : formatCurrency(Number(bill.target || 0)),
        postBillCash,
      };
    });
  const weeklyPacePoints = lastSevenDays.map((day, index) => {
    const cumulativeActual = lastSevenDays
      .slice(0, index + 1)
      .reduce((sum, currentDay) => sum + currentDay.spent, 0);
    const cumulativeSafe = dailySafeToSpend * (index + 1);

    return {
      ...day,
      cumulativeActual,
      cumulativeSafe,
    };
  });
  const weeklyPaceMax = Math.max(
    ...weeklyPacePoints.flatMap((point) => [point.cumulativeActual, point.cumulativeSafe]),
    1
  );
  const buildPolyline = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = 100 - (value / weeklyPaceMax) * 100;
        return `${x},${Number.isFinite(y) ? y : 100}`;
      })
      .join(" ");
  const actualSpendPolyline = buildPolyline(
    weeklyPacePoints.map((point) => point.cumulativeActual)
  );
  const safeSpendPolyline = buildPolyline(
    weeklyPacePoints.map((point) => point.cumulativeSafe)
  );
  const mobileSectionClass = (tabs: MobileTab | MobileTab[]) => {
    const allowedTabs = Array.isArray(tabs) ? tabs : [tabs];
    return allowedTabs.includes(activeMobileTab)
      ? "block translate-y-0 opacity-100 transition-all duration-200"
      : "hidden";
  };
  const selectMobileTab = (tab: MobileTab) => {
    setActiveMobileTab(tab);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const desktopPanelPaddingClass =
    workspaceDensity === "compact" ? "lg:p-3.5" : "lg:p-4";
  const desktopCardPaddingClass =
    workspaceDensity === "compact" ? "lg:p-3" : "lg:p-4";
  const topOverspendingCategories = overspendingDefense
    .filter((cat) => cat.weeklyRemaining <= 0 || cat.monthlyRemaining <= 0)
    .slice(0, 2)
    .map((cat) => cat.name);
  const safeToSpendReason =
    safeToSpend > 0
      ? cashAvailableUntilPayday <= 0
        ? "Bills before your next paycheck are using up your free cash."
        : topOverspendingCategories.length > 0
          ? `${topOverspendingCategories.join(" and ")} ${topOverspendingCategories.length === 1 ? "is" : "are"} already fully used.`
          : "You still have room to spend within your cash flow and funded categories."
      : cashAvailableUntilPayday <= 0
        ? "No cash free before next payday."
        : topOverspendingCategories.length > 0
          ? `${topOverspendingCategories.join(" and ")} ${topOverspendingCategories.length === 1 ? "is" : "are"} already fully used.`
          : upcomingBillsBeforePaydayTotal > 0
            ? "Bills due before payday leave no flexible spending."
            : fundedSpendingRemaining <= 0
              ? "Your funded spending categories do not have any room left."
              : "Your weekly safe-to-spend room is currently used up.";
  const flexibleCashBreakdown = [
    {
      label: "Bank balance",
      value: formatCurrency(currentBankBalance),
    },
    {
      label: "Bills before payday",
      value: `-${formatCurrency(upcomingBillsBeforePaydayTotal)}`,
      tone: upcomingBillsBeforePaydayTotal > 0 ? "negative" : "default",
    },
    {
      label: "Goal reserves",
      value: `-${formatCurrency(assignedGoalReserve)}`,
      tone: assignedGoalReserve > 0 ? "negative" : "default",
    },
    {
      label: "Protected buffer",
      value: `-${formatCurrency(protectedBuffer)}`,
      tone: "negative",
    },
    {
      label: "Flexible cash now",
      value: formatCurrency(flexibleCashNow),
      tone: flexibleCashNow >= 0 ? "positive" : "negative",
    },
  ] as const;
  const safeDailyPaceBreakdown = [
    {
      label: "Cash runway pace",
      value: formatCurrency(dailyCashAllowance),
    },
    {
      label: "Funded category pace",
      value: formatCurrency(dailyFundedAllowance),
    },
    {
      label: "Unassigned cash pace",
      value: formatCurrency(dailyUnassignedAllowance),
      tone: dailyUnassignedAllowance > 0 ? "positive" : "default",
    },
    {
      label: "Safe daily pace",
      value: formatCurrency(safeDailyPace),
      tone: safeDailyPace > 0 ? "positive" : "default",
    },
  ] as const;
  const todayFocusLabel =
    safeToSpend <= 0
      ? "Protect cash flow"
      : safeDailyPace >= 25
        ? "Comfortable pace"
        : "Stay paced";
  const canAfford =
    Number(planned || 0) <= safeToSpend &&
    Number(planned || 0) <= availableCash;
  const enteredTransactionAmount = Math.abs(Number(amount || 0));
  const selectedCategoryRow = categoryRows.find(
    (category) => category.name === selectedCategory
  );
  const weeklyPaceBreaks =
    transactionType === "expense" &&
    enteredTransactionAmount > 0 &&
    Boolean(
      (selectedCategoryRow &&
        enteredTransactionAmount > Math.max(selectedCategoryRow.weeklyRemaining, 0)) ||
        enteredTransactionAmount > safeThisWeek
    );
  const transactionPaceWarning =
    transactionType !== "expense" || enteredTransactionAmount <= 0
      ? null
      : selectedCategoryRow &&
          enteredTransactionAmount > Math.max(selectedCategoryRow.weeklyRemaining, 0)
        ? `${selectedCategory} only has ${formatCurrency(
            Math.max(selectedCategoryRow.weeklyRemaining, 0)
          )} left in this week's pace.`
        : enteredTransactionAmount > safeThisWeek
          ? `This expense is above your current safe-this-week room of ${formatCurrency(
              safeThisWeek
            )}.`
          : null;

  const handleTransactionMerchantChange = (value: string) => {
    setTransactionMerchant(value);

    const history = merchantHistory.get(normalizeMerchantName(value));
    if (!history) return;

    const topCategory =
      Object.entries(history.categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      null;

    if (topCategory) {
      setSelectedCategory(topCategory);
    }

    if (history.lastAccountId) {
      setTransactionAccountId(history.lastAccountId);
    }
  };

  const fundItem = (itemKey: string, amount: number) => {
    if (amount <= 0) return;
    const nextAssignments = {
      ...assignedBudget,
      [itemKey]: Number(assignedBudget[itemKey] || 0) + amount,
    };

    void commitAssignedBudget(nextAssignments);
  };

  const autoAssignRemaining = () => {
    if (readyToAssign <= 0) return;

    const allocationOrder = [...billBudgetItems, ...categoryBudgetItems].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    const nextAssignments = { ...assignedBudget };
    let remaining = readyToAssign;

    allocationOrder.forEach((item) => {
      if (remaining <= 0) return;
      const currentAssigned = Number(nextAssignments[item.key] || 0);
      const needed = Math.max(item.target - currentAssigned, 0);
      const allocation = Math.min(needed, remaining);

      if (allocation > 0) {
        nextAssignments[item.key] = currentAssigned + allocation;
        remaining -= allocation;
      }
    });

    void commitAssignedBudget(nextAssignments);
    pushToast("Ready cash assigned.");
  };

  const resetAssignments = () => {
    void commitAssignedBudget({});
    pushToast("Assignments reset.", "info");
  };

  const payoffPlan = useMemo(() => {
    return simulateDebtPlan(
      debts,
      debtStrategy,
      Number(extraDebtPayment || 0),
      new Date()
    );
  }, [debts, debtStrategy, extraDebtPayment]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0F1C] text-white">
        Loading Money OS...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.10),_transparent_24%),linear-gradient(180deg,_#08101f_0%,_#0b1324_46%,_#09101d_100%)] px-4 py-4 pb-28 text-white sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
      {toast ? (
        <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-end">
          <div
            className={
              toast.tone === "success"
                ? "flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/12 px-4 py-3 text-sm text-emerald-100 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur"
                : toast.tone === "warning"
                  ? "flex max-w-sm items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/12 px-4 py-3 text-sm text-amber-100 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur"
                  : "flex max-w-sm items-center gap-3 rounded-2xl border border-cyan-400/40 bg-cyan-500/12 px-4 py-3 text-sm text-cyan-100 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur"
            }
          >
            <AppIcon
              name={toast.tone === "success" ? "success" : toast.tone === "warning" ? "warning" : "info"}
              className="h-5 w-5 shrink-0"
            />
            <span>{toast.message}</span>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl space-y-5 lg:space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-cyan-400/25 bg-[#10192c]/90 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur xl:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-cyan-100/55">
                Money OS
              </p>
              <p className="mt-3 max-w-xl text-sm text-slate-400">
                Plan every dollar, protect bills, and turn your assigned budget into a weekly spending number you can actually trust.
              </p>
            </div>

            <button
              onClick={signOut}
              className="rounded-xl border border-slate-600/80 bg-slate-950/30 px-4 py-2 text-xs uppercase tracking-[0.25em] text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              Sign Out
            </button>
          </div>

          <div className="mt-6 hidden gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end lg:grid">
            <div>
              <h1 className="text-5xl font-bold text-cyan-300 drop-shadow-[0_0_16px_rgba(34,211,238,0.45)] sm:text-6xl">
            ${safeToSpend.toFixed(2)}
              </h1>

              <p className={safeToSpend <= 0 ? "mt-2 text-red-400" : "mt-2 text-emerald-400"}>
                {safeToSpendStatus}
              </p>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                {safeToSpendReason}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <div className="rounded-full border border-slate-700/80 bg-slate-950/35 px-4 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">This Week</p>
                  <p className={safeThisWeek <= 0 ? "mt-1 text-base text-red-300" : "mt-1 text-base text-slate-50"}>
                    {formatCurrency(safeThisWeek)}
                  </p>
                </div>
                <div className="rounded-full border border-slate-700/80 bg-slate-950/35 px-4 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Safe By Friday</p>
                  <p className="mt-1 text-base text-slate-50">
                    {formatCurrency(fridayNumberAfterPlanned)}
                  </p>
                </div>
                <div className="rounded-full border border-slate-700/80 bg-slate-950/35 px-4 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Underfunded</p>
                  <p className="mt-1 text-base text-slate-50">
                    {formatCurrency(underfundedTotal)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Safe Daily Pace" value={formatCurrency(safeDailyPace)} valueClassName="mt-3 text-3xl text-slate-50" />
              <MetricCard
                label="Flexible Cash Now"
                value={formatCurrency(flexibleCashNow)}
                valueClassName={flexibleCashNow < 0 ? "mt-3 text-3xl text-red-400" : "mt-3 text-3xl text-slate-50"}
              />
              <MetricCard
                label="Next Payday"
                value={nextPayday ? formatMonthYear(nextPayday) : "Set schedule"}
                valueClassName="mt-3 text-2xl text-slate-50"
              />
              <MetricCard
                label="Ready To Assign"
                value={formatCurrency(readyToAssign)}
                valueClassName={readyToAssign < 0 ? "mt-3 text-3xl text-red-400" : "mt-3 text-3xl text-emerald-400"}
              />
            </div>
          </div>

          <div className="mt-5 space-y-4 lg:hidden">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Safe To Spend</p>
              <h1 className="mt-2 text-5xl font-bold text-cyan-300 drop-shadow-[0_0_16px_rgba(34,211,238,0.45)]">
                ${safeToSpend.toFixed(2)}
              </h1>
              <p className={safeToSpend <= 0 ? "mt-2 text-sm text-red-400" : "mt-2 text-sm text-emerald-400"}>
                {safeToSpendStatus}
              </p>
              <p className="mt-2 text-sm text-slate-400">{safeToSpendReason}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Safe Daily Pace" value={formatCurrency(safeDailyPace)} />
              <MetricCard
                label="Flexible Cash Now"
                value={formatCurrency(flexibleCashNow)}
                valueClassName={flexibleCashNow < 0 ? "mt-2 text-2xl text-red-400" : "mt-2 text-2xl text-slate-50"}
              />
              <MetricCard
                label="Next Payday"
                value={nextPayday ? nextPayday.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Set schedule"}
                valueClassName="mt-2 text-xl text-slate-50"
              />
              <MetricCard
                label="Ready To Assign"
                value={formatCurrency(readyToAssign)}
                valueClassName={readyToAssign < 0 ? "mt-2 text-2xl text-red-400" : "mt-2 text-2xl text-emerald-400"}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => selectMobileTab("spending")}
                className="rounded-2xl border border-cyan-400/70 bg-cyan-400/10 px-3 py-3 text-xs font-medium uppercase tracking-[0.18em] text-cyan-300 transition-all duration-200"
              >
                Add Spend
              </button>
              <button
                onClick={() => selectMobileTab("budget")}
                className="rounded-2xl border border-slate-700 bg-slate-950/40 px-3 py-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-300 transition-all duration-200"
              >
                Budget
              </button>
              <button
                onClick={() => selectMobileTab("bills")}
                className="rounded-2xl border border-slate-700 bg-slate-950/40 px-3 py-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-300 transition-all duration-200"
              >
                Bills
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="This Week"
                value={formatCurrency(safeThisWeek)}
                valueClassName={safeThisWeek <= 0 ? "mt-2 text-2xl text-red-400" : "mt-2 text-2xl text-slate-50"}
              />
              <MetricCard label="Underfunded" value={formatCurrency(underfundedTotal)} />
            </div>

            <div className="grid gap-3">
              <BreakdownCard
                title="Flexible Cash Now"
                rows={[...flexibleCashBreakdown]}
              />
              <BreakdownCard
                title="Safe Daily Pace"
                rows={[...safeDailyPaceBreakdown]}
              />
            </div>
          </div>

          {categories.length === 0 || bills.length === 0 || accounts.length === 0 ? (
            <button
              onClick={setupDefaults}
              className="mt-5 w-full rounded-2xl bg-cyan-400 py-3 font-bold text-black shadow-[0_10px_30px_rgba(34,211,238,0.28)]"
            >
              Initialize Budget System
            </button>
          ) : null}

          {syncError ? (
            <p className="mt-5 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {syncError}
            </p>
          ) : null}
        </section>

        <div className="sticky top-3 z-20 -mx-1 lg:hidden">
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-2 px-1">
              {MOBILE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => selectMobileTab(tab.id)}
                  className={
                    activeMobileTab === tab.id
                      ? "flex min-w-[96px] items-center justify-center gap-2 rounded-full border border-cyan-400 bg-cyan-400/15 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.16)] transition-all duration-200"
                      : "flex min-w-[96px] items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-950/50 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 transition-all duration-200"
                  }
                >
                  <AppIcon name={tab.icon} className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap leading-none">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 px-4 py-3 text-sm text-slate-300 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Current View</p>
              <p className="mt-1 text-base text-slate-50">
                {MOBILE_TABS.find((tab) => tab.id === activeMobileTab)?.label}
              </p>
            </div>
            <p className="max-w-[180px] text-right text-xs text-slate-500">
              {activeMobileTab === "home"
                ? `${todayFocusLabel} today`
                : activeMobileTab === "budget"
                  ? "Assign money and edit targets"
                  : activeMobileTab === "spending"
                    ? "Track spending and pace"
                    : activeMobileTab === "bills"
                      ? "Bills, cash timing, and payday"
                      : "Debt, snapshots, and long-range planning"}
            </p>
          </div>
        </div>

        <div className="lg:hidden">
          <div className="sticky top-[4.9rem] z-20 rounded-2xl border border-cyan-400/20 bg-[#10192c]/92 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Safe Daily Pace</p>
                <p className="mt-1 text-lg text-cyan-300">{formatCurrency(safeDailyPace)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Ready To Assign</p>
                <p className={readyToAssign < 0 ? "mt-1 text-lg text-red-400" : "mt-1 text-lg text-emerald-300"}>
                  {formatCurrency(readyToAssign)}
                </p>
              </div>
            </div>
          </div>

          {activeMobileTab === "home" ? (
            <div className="-mx-4 mt-3 overflow-x-auto px-4 pb-1">
              <div className="flex snap-x snap-mandatory gap-3">
                <MetricCard
                  className="min-w-[240px] snap-start"
                  label="Today Focus"
                  value={todayFocusLabel}
                  valueClassName="mt-2 text-2xl text-slate-50"
                  detail={safeToSpendReason}
                />
                <MetricCard
                  className="min-w-[220px] snap-start"
                  label="Flexible Cash Now"
                  value={formatCurrency(flexibleCashNow)}
                  valueClassName={flexibleCashNow < 0 ? "mt-2 text-2xl text-red-400" : "mt-2 text-2xl text-slate-50"}
                />
                <MetricCard
                  className="min-w-[220px] snap-start"
                  label="Next Payday"
                  value={nextPayday ? nextPayday.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Set schedule"}
                  valueClassName="mt-2 text-2xl text-slate-50"
                  detail={daysUntilNextPayday !== null ? `${daysUntilNextPayday} day${daysUntilNextPayday === 1 ? "" : "s"} away` : "No payday yet"}
                />
                <MetricCard
                  className="min-w-[220px] snap-start"
                  label="Reserved This Paycheck"
                  value={formatCurrency(upcomingBillsBeforePaydayTotal)}
                  valueClassName="mt-2 text-2xl text-slate-50"
                  detail={`${upcomingBillsBeforePayday.length} reserved item${upcomingBillsBeforePayday.length === 1 ? "" : "s"}`}
                />
                <MetricCard
                  className="min-w-[220px] snap-start"
                  label="Defense Alerts"
                  value={String(overspendingDefense.filter((category) => category.alert !== "Watching").length)}
                  valueClassName="mt-2 text-2xl text-slate-50"
                  detail="Categories running hot this week"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-12">
        <aside className="order-1 hidden self-start lg:sticky lg:top-6 lg:col-span-2 lg:block">
          <div className={`rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${desktopPanelPaddingClass}`.trim()}>
            <p className="text-sm text-gray-400">Workspace</p>
            <p className="mt-1 text-xs text-gray-500">
              Pick the area you want to work in. The center updates to that workflow.
            </p>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-black/20 p-2">
              <p className="px-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Density
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setWorkspaceDensity("compact")}
                  className={
                    workspaceDensity === "compact"
                      ? "rounded-xl border border-cyan-400 bg-cyan-400/12 px-3 py-2 text-xs uppercase tracking-[0.16em] text-cyan-200"
                      : "rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-400"
                  }
                >
                  Compact
                </button>
                <button
                  onClick={() => setWorkspaceDensity("comfortable")}
                  className={
                    workspaceDensity === "comfortable"
                      ? "rounded-xl border border-cyan-400 bg-cyan-400/12 px-3 py-2 text-xs uppercase tracking-[0.16em] text-cyan-200"
                      : "rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-400"
                  }
                >
                  Comfortable
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {MOBILE_TABS.map((tab) => (
                <button
                  key={`desktop-${tab.id}`}
                  onClick={() => selectMobileTab(tab.id)}
                  className={
                    activeMobileTab === tab.id
                      ? "flex w-full items-center gap-3 rounded-2xl border border-cyan-400 bg-cyan-400/12 px-4 py-3 text-left text-cyan-200"
                      : "flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-black/20 px-4 py-3 text-left text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
                  }
                >
                  <AppIcon name={tab.icon} className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm">{tab.label}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {tab.id === "home"
                        ? "Overview"
                        : tab.id === "budget"
                          ? "Plan"
                          : tab.id === "spending"
                            ? "Track"
                            : tab.id === "bills"
                              ? "Cash Flow"
                              : "Long Range"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <div className="order-2 min-w-0 lg:col-span-7">
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-12">
        <aside className="order-3 hidden self-start 2xl:sticky 2xl:top-6 2xl:col-span-3 2xl:block">
          <div className={`rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] ${desktopPanelPaddingClass}`.trim()}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Today Rail</p>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                Live
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              <div className={`rounded-2xl border border-slate-800 bg-black/30 p-4 text-sm text-slate-300 ${desktopCardPaddingClass}`.trim()}>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Today Focus</p>
                <p className="mt-2 text-sm text-cyan-200">{todayFocusLabel}</p>
                <p className="mt-2 text-sm text-slate-400">{safeToSpendReason}</p>
              </div>

              <div className={`rounded-2xl border border-slate-800 bg-black/30 p-4 ${desktopCardPaddingClass}`.trim()}>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Cash</p>
                <div className="mt-3 grid gap-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Flexible now</p>
                      <p className={flexibleCashNow < 0 ? "mt-1 text-2xl text-red-400" : "mt-1 text-2xl text-slate-50"}>
                        {formatCurrency(flexibleCashNow)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Bank balance</p>
                      <p className="mt-1 text-base text-slate-50">{formatCurrency(currentBankBalance)}</p>
                    </div>
                  </div>
                  <BreakdownCard
                    title="Cash Breakdown"
                    rows={[...flexibleCashBreakdown]}
                    density={workspaceDensity}
                    className="border-0 bg-slate-950/40 p-0"
                  />
                </div>
              </div>

              <div className={`rounded-2xl border border-slate-800 bg-black/30 p-4 ${desktopCardPaddingClass}`.trim()}>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Pace</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Daily pace</p>
                    <p className="mt-1 text-xl text-slate-50">{formatCurrency(safeDailyPace)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">This week</p>
                    <p className={safeThisWeek <= 0 ? "mt-1 text-xl text-red-400" : "mt-1 text-xl text-slate-50"}>
                      {formatCurrency(safeThisWeek)}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <BreakdownCard
                    title="Pace Breakdown"
                    rows={[...safeDailyPaceBreakdown]}
                    density={workspaceDensity}
                    className="border-0 bg-slate-950/40 p-0"
                  />
                </div>
              </div>

              <div className={`rounded-2xl border border-slate-800 bg-black/30 p-4 ${desktopCardPaddingClass}`.trim()}>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Risk & Timing</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Next payday</p>
                    <p className="mt-1 text-base text-slate-50">
                      {nextPayday ? nextPayday.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Unassigned</p>
                    <p className={readyToAssign < 0 ? "mt-1 text-base text-red-400" : "mt-1 text-base text-emerald-300"}>
                      {formatCurrency(readyToAssign)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Safe by Friday</p>
                    <p className="mt-1 text-base text-slate-50">{formatCurrency(fridayNumberAfterPlanned)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Underfunded</p>
                    <p className="mt-1 text-base text-slate-50">{formatCurrency(underfundedTotal)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <DashboardPanel
          className={`${mobileSectionClass("home")} hidden lg:block lg:col-span-2 2xl:col-span-9`}
          title="Today Workspace"
          subtitle="Start here to decide what you can spend, what needs attention, and where to go next."
          density={workspaceDensity}
          right={
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
              {todayFocusLabel}
            </span>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-800 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Today Summary
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Safe Daily Pace"
                  value={formatCurrency(safeDailyPace)}
                  density={workspaceDensity}
                  valueClassName="mt-2 text-2xl text-slate-50"
                />
                <MetricCard
                  label="Flexible Cash Now"
                  value={formatCurrency(flexibleCashNow)}
                  density={workspaceDensity}
                  valueClassName={
                    flexibleCashNow < 0
                      ? "mt-2 text-2xl text-red-400"
                      : "mt-2 text-2xl text-slate-50"
                  }
                />
                <MetricCard
                  label="Next Payday"
                  value={
                    nextPayday
                      ? nextPayday.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Set schedule"
                  }
                  density={workspaceDensity}
                  valueClassName="mt-2 text-2xl text-slate-50"
                />
                <MetricCard
                  label="Ready To Assign"
                  value={formatCurrency(readyToAssign)}
                  density={workspaceDensity}
                  valueClassName={
                    readyToAssign < 0
                      ? "mt-2 text-2xl text-red-400"
                      : "mt-2 text-2xl text-emerald-400"
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Quick Actions
              </p>
              <div className="mt-3 grid gap-2">
                <ActionButton
                  onClick={() => selectMobileTab("spending")}
                  tone="primary"
                  className="justify-start text-left"
                >
                  Add spending or income
                </ActionButton>
                <ActionButton
                  onClick={() => selectMobileTab("budget")}
                  className="justify-start text-left"
                >
                  Assign money and fund categories
                </ActionButton>
                <ActionButton
                  onClick={() => selectMobileTab("bills")}
                  tone="ghost"
                  className="justify-start text-left"
                >
                  Review bills before payday
                </ActionButton>
              </div>
            </div>
          </div>
        </DashboardPanel>
        <DashboardPanel
          className={`${mobileSectionClass("budget")} lg:col-span-2 2xl:col-span-5`}
          title="Budget Planner"
          density={workspaceDensity}
          right={
            <p className={readyToAssign < 0 ? "text-sm text-red-400" : "text-sm text-green-400"}>
              {readyToAssign < 0 ? "Over-assigned" : "Ready to assign"} {formatCurrency(Math.abs(readyToAssign))}
            </p>
          }
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
              <p className="text-gray-400">Monthly Income</p>
              <input
                value={monthlyIncomeInput}
                onChange={(e) => setMonthlyIncomeInput(e.target.value)}
                type="number"
                className="mt-2 w-full rounded-lg bg-[#0A0F1C] border border-gray-700 p-2"
              />
            </div>
            <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
              <p className="text-gray-400">Assigned Dollars</p>
              <p className="mt-2 text-lg">{formatCurrency(assignedTotal)}</p>
              <p className="text-xs text-gray-500">
                Targets total: {formatCurrency(fixedBillsTotal + monthlyBudgetTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
              <p className="text-gray-400">Bills After Income</p>
              <p className="mt-2 text-lg">{formatCurrency(monthlyPlannedGap)}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
              <p className="text-gray-400">Underfunded</p>
              <p className="mt-2 text-lg">{formatCurrency(underfundedTotal)}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={autoAssignRemaining}
              className="flex-1 rounded-xl bg-cyan-400 py-2 font-bold text-black"
            >
              Auto-Assign Ready Cash
            </button>
            <button
              onClick={resetAssignments}
              className="rounded-xl border border-gray-600 px-4 py-2 text-gray-300"
            >
              Reset
            </button>
          </div>
        </DashboardPanel>

        <DashboardPanel
          className={`${mobileSectionClass("bills")} lg:col-span-2 2xl:col-span-7`}
          title="Paycheck Calendar"
          density={workspaceDensity}
          right={
            <p className={cashCoversUntilPayday ? "text-sm text-emerald-400" : "text-sm text-red-400"}>
              {cashCoversUntilPayday ? "Covered to payday" : "Short before payday"}
            </p>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldLabel label="Pay schedule" className="text-sm text-gray-300">
                  <select
                    value={paycheckSettings.type}
                    onChange={(e) =>
                      setPaycheckSettings((current) => ({
                        ...current,
                        type: e.target.value as PayScheduleType,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-700 bg-[#0A0F1C] p-3"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="twice_monthly">Twice monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </FieldLabel>

                {(paycheckSettings.type === "weekly" ||
                  paycheckSettings.type === "biweekly") ? (
                  <FieldLabel label="Known payday" className="text-sm text-gray-300">
                    <input
                      value={paycheckSettings.anchorDate}
                      onChange={(e) =>
                        setPaycheckSettings((current) => ({
                          ...current,
                          anchorDate: e.target.value,
                        }))
                      }
                      type="date"
                      className="w-full rounded-xl border border-gray-700 bg-[#0A0F1C] p-3"
                    />
                  </FieldLabel>
                ) : null}

                {paycheckSettings.type === "monthly" ? (
                  <FieldLabel label="Day of month" className="text-sm text-gray-300">
                    <input
                      value={paycheckSettings.monthlyDay}
                      onChange={(e) =>
                        setPaycheckSettings((current) => ({
                          ...current,
                          monthlyDay: e.target.value,
                        }))
                      }
                      type="number"
                      min="1"
                      max="31"
                      className="w-full rounded-xl border border-gray-700 bg-[#0A0F1C] p-3"
                    />
                  </FieldLabel>
                ) : null}

                {paycheckSettings.type === "twice_monthly" ? (
                  <>
                    <FieldLabel label="First payday" className="text-sm text-gray-300">
                      <input
                        value={paycheckSettings.firstTwiceMonthlyDay}
                        onChange={(e) =>
                          setPaycheckSettings((current) => ({
                            ...current,
                            firstTwiceMonthlyDay: e.target.value,
                          }))
                        }
                        type="number"
                        min="1"
                        max="31"
                        className="w-full rounded-xl border border-gray-700 bg-[#0A0F1C] p-3"
                      />
                    </FieldLabel>
                    <FieldLabel label="Second payday" className="text-sm text-gray-300">
                      <input
                        value={paycheckSettings.secondTwiceMonthlyDay}
                        onChange={(e) =>
                          setPaycheckSettings((current) => ({
                            ...current,
                            secondTwiceMonthlyDay: e.target.value,
                          }))
                        }
                        type="number"
                        min="1"
                        max="31"
                        className="w-full rounded-xl border border-gray-700 bg-[#0A0F1C] p-3"
                      />
                    </FieldLabel>
                  </>
                ) : null}
              </div>

              <ActionButton
                onClick={() => void savePaycheckSettings()}
                className="mt-3 w-full"
              >
                {paycheckSyncReady ? "Save Paycheck Settings" : "Loading Paycheck Settings"}
              </ActionButton>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Last paycheck</p>
                <p className="mt-2 text-lg text-slate-50">
                  {latestReceivedPaycheck
                    ? new Date(latestReceivedPaycheck.received_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Not recorded yet"}
                </p>
                <p className="text-xs text-gray-500">
                  {latestReceivedPaycheck?.amount
                    ? `${formatCurrency(Number(latestReceivedPaycheck.amount))} received`
                    : "Mark an income transaction or check in manually."}
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Next payday</p>
                <p className="mt-2 text-lg text-slate-50">
                  {nextPayday ? nextPayday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Set pay schedule"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Days until payday</p>
                <p className="mt-2 text-lg text-slate-50">
                  {daysUntilNextPayday ?? "--"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Cash runway</p>
                <p className="mt-2 text-lg text-slate-50">{cashRunwayDays} days</p>
                <p className="text-xs text-gray-500">
                  {formatCurrency(cashAvailableUntilPayday)} free after reserves
                </p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Reserved this paycheck</p>
                <p className="mt-2 text-lg text-slate-50">{formatCurrency(upcomingBillsBeforePaydayTotal)}</p>
                <p className="text-xs text-gray-500">
                  {upcomingBillsBeforePayday.length} reserved item{upcomingBillsBeforePayday.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-black/20 p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <FieldLabel
                  label="Received on"
                  helper="Use this when the paycheck actually lands."
                  className="text-sm text-gray-300"
                >
                  <input
                    value={manualPaycheckDateInput}
                    onChange={(e) => setManualPaycheckDateInput(e.target.value)}
                    type="date"
                    className="w-full rounded-xl border border-gray-700 bg-[#0A0F1C] p-3"
                  />
                </FieldLabel>
                <FieldLabel
                  label="Amount"
                  helper="Optional, but helpful for paycheck history."
                  className="text-sm text-gray-300"
                >
                  <input
                    value={manualPaycheckAmountInput}
                    onChange={(e) => setManualPaycheckAmountInput(e.target.value)}
                    type="number"
                    placeholder="Optional"
                    className="w-full rounded-xl border border-gray-700 bg-[#0A0F1C] p-3"
                  />
                </FieldLabel>
                <div className="flex items-end">
                  <ActionButton onClick={() => void markPaycheckReceived()} className="w-full">
                    Mark Received
                  </ActionButton>
                </div>
              </div>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel
          className={`${mobileSectionClass(["home", "bills"])} lg:col-span-2 2xl:col-span-4`}
          title="Account Balance Trend"
          subtitle="Estimated last 7 days"
          density={workspaceDensity}
        >
          <div className="mt-1 grid grid-cols-7 items-end gap-2">
            {accountBalanceTrend.map((day) => (
              <div key={`balance-${day.label}`} className="flex flex-col items-center gap-2">
                <div className="flex h-28 items-end">
                  <div
                    className={day.balance >= 0 ? "w-7 rounded-t-lg bg-cyan-400/80" : "w-7 rounded-t-lg bg-red-400/80"}
                    style={{
                      height: `${Math.max((Math.abs(day.balance) / maxBalanceTrend) * 96, 8)}px`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-500">{day.label}</p>
                <p className="text-[10px] text-gray-400">{formatCurrency(day.balance)}</p>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel
          className={`${mobileSectionClass(["home", "bills"])} lg:col-span-2 2xl:col-span-4`}
          title="Cash vs Bills Due"
          subtitle="Before next paycheck"
          density={workspaceDensity}
        >
          <div className="space-y-3">
            {cashTimeline.length > 0 ? (
              cashTimeline.map((bill) => (
                <div key={`timeline-${bill.key}`} className="rounded-xl border border-gray-800 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-50">{bill.name}</p>
                      <p className="text-xs text-gray-500">Due {bill.dueLabel}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-50">{bill.reserveLabel}</p>
                      <p className={bill.postBillCash < 0 ? "text-xs text-red-400" : "text-xs text-cyan-300"}>
                        {formatCurrency(bill.postBillCash)} after bill
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No cash-counting bills are due before your next paycheck.</EmptyState>
            )}
          </div>
        </DashboardPanel>

        <DashboardPanel
          className={`${mobileSectionClass("spending")} lg:col-span-2 2xl:col-span-4`}
          title="Category Breakdown"
          subtitle="Month to date"
          density={workspaceDensity}
        >
          <div className="space-y-3">
            {categoryBreakdown.length > 0 ? (
              categoryBreakdown.map((category) => (
                <div key={`breakdown-${category.id}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-50">{category.name}</span>
                    <span className="text-gray-400">{formatCurrency(category.monthlySpent)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full bg-cyan-400"
                      style={{
                        width: `${Math.max((Number(category.monthlySpent) / maxCategoryBreakdown) * 100, 4)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>
                No category spending has been recorded this month yet. Add a few transactions to turn this into a real month-to-date view.
              </EmptyState>
            )}
          </div>
        </DashboardPanel>

        <section className={`${mobileSectionClass(["home", "spending"])} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-12`}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Weekly Safe-To-Spend Pace</p>
            <p className="text-xs text-gray-500">Actual spending vs safe pace</p>
          </div>

          <div className="mt-4 rounded-2xl border border-gray-800 bg-black/25 p-4">
            <svg viewBox="0 0 100 100" className="h-44 w-full overflow-visible">
              <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(148,163,184,0.28)" strokeWidth="1" />
              <polyline
                fill="none"
                stroke="rgba(34,211,238,0.95)"
                strokeWidth="2.5"
                points={safeSpendPolyline}
              />
              <polyline
                fill="none"
                stroke="rgba(248,113,113,0.95)"
                strokeWidth="2.5"
                points={actualSpendPolyline}
              />
            </svg>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                Safe pace
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                Actual spend
              </span>
              <span>{formatCurrency(weeklyPacePoints.at(-1)?.cumulativeSafe || 0)} safe pace by now</span>
              <span>{formatCurrency(weeklyPacePoints.at(-1)?.cumulativeActual || 0)} actually spent</span>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[10px] text-gray-500">
              {weeklyPacePoints.map((point) => (
                <span key={`pace-${point.label}`}>{point.label}</span>
              ))}
            </div>
          </div>
        </section>

        <section className={`${mobileSectionClass("budget")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-7`}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Assign Every Dollar</p>
            <p className="text-xs text-gray-500">{formatMonthYear(now)}</p>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Bill amounts and due dates are managed in <span className="text-slate-300">Recurring Bills</span>. This budget view is for assigning money to those bills and categories, not creating duplicate bill targets.
          </p>

          <div className="mt-3 space-y-4">
            {zeroBasedGroups.map((group) => (
              <div key={group.name} className="rounded-xl border border-gray-800 bg-black/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatCurrency(group.items.reduce((sum, item) => sum + item.assigned, 0))} assigned
                  </p>
                </div>

                <div className="mt-3 space-y-3">
                  <div className="hidden grid-cols-[minmax(0,1fr)_112px_112px_104px_88px] gap-2 px-2 text-[11px] uppercase tracking-[0.16em] text-gray-500 lg:grid">
                    <span>Category</span>
                    <span>Target</span>
                    <span>Assigned</span>
                    <span>Target Action</span>
                    <span>Fund</span>
                  </div>
                  {group.items.map((item) => (
                    <div key={item.key} className="rounded-xl bg-[#0A0F1C] p-3">
                      {(() => {
                        const isManagedBill = item.key.startsWith("bill:");

                        return (
                          <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p>{item.name}</p>
                          <p className="text-xs text-gray-400">{item.detail}</p>
                          {"targetDay" in item ? (
                            <p
                              className={
                                item.reservesBeforePayday
                                  ? "mt-1 text-[11px] text-cyan-300"
                                  : item.targetDay
                                    ? "mt-1 text-[11px] text-amber-300"
                                    : "mt-1 text-[11px] text-gray-500"
                              }
                            >
                              {item.targetDay
                                ? item.reservesBeforePayday
                                  ? `Reserved before payday on the ${item.targetDay}${getDaySuffix(Number(item.targetDay))}`
                                  : `Future target on the ${item.targetDay}${getDaySuffix(Number(item.targetDay))} after next payday`
                                : "No target day set"}
                            </p>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <p>{formatCurrency(item.assigned)}</p>
                          <p className="text-xs text-gray-500">
                            available {formatCurrency(item.available)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full bg-cyan-400"
                          style={{
                            width: `${
                              item.target > 0
                                ? Math.min((item.assigned / item.target) * 100, 100)
                                : item.assigned > 0
                                  ? 100
                                  : 0
                            }%`,
                          }}
                        />
                      </div>

                      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                        <FieldLabel label="Target" className="text-sm lg:hidden">
                          <input
                            value={String(item.target)}
                            type="number"
                            onChange={(e) => updateBudgetItemTarget(item.key, e.target.value)}
                            readOnly={isManagedBill}
                            className={
                              isManagedBill
                                ? "rounded-lg border border-gray-800 bg-slate-950/60 p-2 text-gray-500"
                                : "rounded-lg border border-gray-700 bg-black p-2"
                            }
                          />
                        </FieldLabel>
                        <FieldLabel label="Assigned" className="text-sm lg:hidden">
                          <input
                            value={String(item.assigned)}
                            onChange={(e) => updateAssignedBudget(item.key, e.target.value)}
                            type="number"
                            className="rounded-lg border border-gray-700 bg-black p-2"
                          />
                        </FieldLabel>
                        <input
                          value={String(item.target)}
                          type="number"
                          onChange={(e) => updateBudgetItemTarget(item.key, e.target.value)}
                          readOnly={isManagedBill}
                          className={
                            isManagedBill
                              ? "hidden rounded-lg border border-gray-800 bg-slate-950/60 p-2 text-gray-500 lg:block"
                              : "hidden rounded-lg border border-gray-700 bg-black p-2 lg:block"
                          }
                        />
                        <input
                          value={String(item.assigned)}
                          onChange={(e) => updateAssignedBudget(item.key, e.target.value)}
                          type="number"
                          className="hidden rounded-lg border border-gray-700 bg-black p-2 lg:block"
                        />
                        {isManagedBill ? (
                          <ActionButton
                            onClick={() => selectMobileTab("bills")}
                            tone="ghost"
                            className="rounded-lg px-3"
                          >
                            Edit In Bills
                          </ActionButton>
                        ) : (
                          <ActionButton
                            onClick={() => void saveBudgetItemTarget(item.key)}
                            tone="ghost"
                            className="rounded-lg px-3"
                          >
                            Save Target
                          </ActionButton>
                        )}
                        <ActionButton
                          onClick={() => fundItem(item.key, Math.min(item.needed, Math.max(readyToAssign, 0)))}
                          className="rounded-lg px-3"
                        >
                          Fund
                        </ActionButton>
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${mobileSectionClass("bills")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4 space-y-3`}>
          <p className="text-sm text-gray-400">Update Bank Balance</p>
          <input
            value={bankBalanceInput}
            onChange={(e) => setBankBalanceInput(e.target.value)}
            placeholder="Current checking balance"
            type="number"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />
          <ActionButton
            onClick={updateMainBalance}
            className="w-full"
          >
            Save Balance
          </ActionButton>
        </section>

        <section className={`${mobileSectionClass("spending")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4 space-y-3`}>
          <p className="text-sm text-gray-400">Quick Add Transaction</p>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-800 bg-black/20 p-1 text-xs uppercase tracking-[0.16em] text-gray-400">
            <button
              onClick={() => setTransactionType("expense")}
              className={
                transactionType === "expense"
                  ? "rounded-lg bg-red-500/15 px-3 py-2 text-red-300"
                  : "rounded-lg px-3 py-2"
              }
            >
              Expense
            </button>
            <button
              onClick={() => setTransactionType("income")}
              className={
                transactionType === "income"
                  ? "rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-300"
                  : "rounded-lg px-3 py-2"
              }
            >
              Income
            </button>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          >
            {categories.length > 0 ? (
              categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))
            ) : (
              <>
                <option>Groceries</option>
                <option>Gas</option>
                <option>Eating Out</option>
              </>
            )}
          </select>

          <input
            value={transactionMerchant}
            onChange={(e) => handleTransactionMerchantChange(e.target.value)}
            placeholder="Merchant or source"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

          {merchantSuggestion ? (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-3 text-xs text-cyan-100">
              <p>
                Auto-categorized to <span className="text-cyan-300">{merchantSuggestion.category || selectedCategory}</span>
                {" "}from {merchantSuggestion.count} prior transaction{merchantSuggestion.count === 1 ? "" : "s"}.
              </p>
              {merchantSuggestion.cadence ? (
                <p className="mt-1 text-cyan-200/80">
                  Looks recurring on a {merchantSuggestion.cadence} cadence.
                </p>
              ) : null}
            </div>
          ) : null}

          <textarea
            value={transactionMemo}
            onChange={(e) => setTransactionMemo(e.target.value)}
            placeholder="Memo"
            rows={2}
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

          <select
            value={activeTransactionAccountId}
            onChange={(e) => setTransactionAccountId(e.target.value)}
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          >
            <option value="">No account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <input
            value={transactionDateInput}
            onChange={(e) => setTransactionDateInput(e.target.value)}
            type="date"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

          {transactionType === "income" ? (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100">
              <div>
                <p className="font-medium text-emerald-200">Treat this income as a paycheck</p>
                <p className="mt-1 text-xs text-emerald-100/70">
                  This will mark the paycheck as received and roll the next one forward.
                </p>
              </div>
              <input
                checked={transactionCountsAsPaycheck}
                onChange={(e) => setTransactionCountsAsPaycheck(e.target.checked)}
                type="checkbox"
                className="h-4 w-4 accent-emerald-400"
              />
            </label>
          ) : null}

          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={transactionType === "income" ? "Income amount" : "Expense amount"}
            type="number"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

          <ActionButton
            onClick={addTransaction}
            tone="primary"
            className="w-full font-bold"
          >
            Add Transaction
          </ActionButton>

          {transactionPaceWarning ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <div className="flex items-start gap-3">
                <AppIcon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    {weeklyPaceBreaks ? "This spending breaks your current weekly pace." : "Spending warning"}
                  </p>
                  <p className="mt-1 text-amber-100/80">{transactionPaceWarning}</p>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className={`${mobileSectionClass("budget")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4 space-y-3`}>
          <p className="text-sm text-gray-400">Add Spending Category</p>

          <label className="block text-sm text-gray-300">
            <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
              Category Name
            </span>
            <input
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value);
                setCategoryFormMessage(null);
              }}
              placeholder="Category name"
              className="w-full rounded-xl bg-black border border-gray-700 p-3"
            />
          </label>

          <label className="block text-sm text-gray-300">
            <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
              Group Name
            </span>
            <input
              value={newCategoryGroup}
              onChange={(e) => {
                setNewCategoryGroup(e.target.value);
                setCategoryFormMessage(null);
              }}
              placeholder="Group name"
              className="w-full rounded-xl bg-black border border-gray-700 p-3"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-300">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                Weekly Limit
              </span>
              <input
                value={newCategoryWeeklyLimit}
                onChange={(e) => {
                  setNewCategoryWeeklyLimit(e.target.value);
                  setCategoryFormMessage(null);
                }}
                placeholder="Weekly limit"
                type="number"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
            </label>

            <label className="text-sm text-gray-300">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                Monthly Limit
              </span>
              <input
                value={newCategoryMonthlyLimit}
                onChange={(e) => {
                  setNewCategoryMonthlyLimit(e.target.value);
                  setCategoryFormMessage(null);
                }}
                placeholder="Monthly limit"
                type="number"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
            </label>

            <label className="text-sm text-gray-300">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                Target Day
              </span>
              <input
                value={newCategoryTargetDay}
                onChange={(e) => {
                  setNewCategoryTargetDay(e.target.value);
                  setCategoryFormMessage(null);
                }}
                placeholder="Optional day of month"
                type="number"
                min="1"
                max="31"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
            </label>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-gray-300">
            <span>Split Across Paychecks</span>
            <input
              checked={newCategorySplitAcrossPaychecks}
              onChange={(e) => {
                setNewCategorySplitAcrossPaychecks(e.target.checked);
                setCategoryFormMessage(null);
              }}
              type="checkbox"
              className="h-4 w-4 accent-cyan-400"
            />
          </label>

          <div className="rounded-xl border border-gray-800 bg-black/30 p-3 text-xs text-gray-400">
            <p>Name a spending bucket, choose its group, and optionally set weekly or monthly targets.</p>
            {categoryFormError ? (
              <p className="mt-2 text-red-400">{categoryFormError}</p>
            ) : (
              <p className="mt-2 text-gray-500">You can save with zero limits and adjust targets later.</p>
            )}
            {categoryFormMessage ? (
              <p className={categoryFormMessage.startsWith("Saved") ? "mt-2 text-emerald-400" : "mt-2 text-red-400"}>
                {categoryFormMessage}
              </p>
            ) : null}
          </div>

          <ActionButton
            onClick={addCategory}
            disabled={!canSubmitCategory}
            className={
              canSubmitCategory
                ? "w-full py-3"
                : "w-full border-gray-700 py-3 text-gray-500"
            }
          >
            {categorySubmitting ? "Saving Category..." : "Save Category"}
          </ActionButton>
        </section>

        <section className={`${mobileSectionClass("bills")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-6`}>
          <p className="text-sm text-gray-400">Recurring Bills</p>
          <div className="mt-3 rounded-xl border border-gray-800 bg-black/30 p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Add recurring bill</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={newBillName}
                onChange={(e) => setNewBillName(e.target.value)}
                placeholder="Bill name"
                className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
              />
              <input
                value={newBillCategory}
                onChange={(e) => setNewBillCategory(e.target.value)}
                placeholder="Category"
                className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
              />
              <input
                value={newBillAmount}
                onChange={(e) => setNewBillAmount(e.target.value)}
                type="number"
                placeholder="Amount"
                className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
              />
              <input
                value={newBillDueDay}
                onChange={(e) => setNewBillDueDay(e.target.value)}
                type="number"
                min="1"
                max="31"
                placeholder="Due day"
                className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
              />
            </div>
            <p className="mt-3 text-xs text-gray-500">
              New bills count toward Available Cash by default. Toggle them off below for debt-style obligations.
            </p>
            <label className="mt-3 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0A0F1C] px-4 py-3 text-sm text-gray-300">
              <span>Split Across Paychecks</span>
              <input
                checked={newBillSplitAcrossPaychecks}
                onChange={(e) => setNewBillSplitAcrossPaychecks(e.target.checked)}
                type="checkbox"
                className="h-4 w-4 accent-cyan-400"
              />
            </label>
            <button
              onClick={addRecurringBill}
              className="mt-3 w-full rounded-xl border border-cyan-400 py-2 text-cyan-300"
            >
              Add Bill
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {bills.map((bill) => (
              <div key={bill.id} className="rounded-xl bg-black/40 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <FieldLabel label="Bill Name" className="col-span-2">
                    <input
                      value={bill.name}
                      onChange={(e) => updateBillField(bill.id, "name", e.target.value)}
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <FieldLabel label="Amount">
                    <input
                      value={String(bill.amount)}
                      onChange={(e) => updateBillField(bill.id, "amount", e.target.value)}
                      type="number"
                      placeholder="Amount"
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <FieldLabel label="Due Day">
                    <input
                      value={String(bill.due_day)}
                      onChange={(e) => updateBillField(bill.id, "due_day", e.target.value)}
                      type="number"
                      placeholder="Due day"
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <FieldLabel label="Budget Category" className="col-span-2">
                    <input
                      value={bill.category}
                      onChange={(e) => updateBillField(bill.id, "category", e.target.value)}
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <label className="col-span-2 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0A0F1C] px-4 py-3 text-sm text-gray-300">
                    <span>Counts toward Available Cash</span>
                    <input
                      checked={bill.counts_toward_available_cash ?? true}
                      onChange={(e) =>
                        updateBillField(
                          bill.id,
                          "counts_toward_available_cash",
                          e.target.checked
                        )
                      }
                      type="checkbox"
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                  <label className="col-span-2 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0A0F1C] px-4 py-3 text-sm text-gray-300">
                    <span>Split Across Paychecks</span>
                    <input
                      checked={bill.split_across_paychecks ?? false}
                      onChange={(e) =>
                        updateBillField(
                          bill.id,
                          "split_across_paychecks",
                          e.target.checked
                        )
                      }
                      type="checkbox"
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                </div>
                <ActionButton
                  onClick={() => saveBill(bill)}
                  className="mt-3 w-full rounded-lg"
                >
                  Save Bill
                </ActionButton>
              </div>
            ))}
          </div>
        </section>

        <section className={`${mobileSectionClass("budget")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-6`}>
          <p className="text-sm text-gray-400">Budget Categories</p>
          <div className="mt-3 space-y-3">
            {categories.map((category) => (
              <div key={category.id} className="rounded-xl bg-black/40 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <FieldLabel label="Category Name" className="col-span-2">
                    <input
                      value={category.name}
                      onChange={(e) => updateCategoryField(category.id, "name", e.target.value)}
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <FieldLabel label="Group Name" className="col-span-2">
                    <input
                      value={category.group_name}
                      onChange={(e) => updateCategoryField(category.id, "group_name", e.target.value)}
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <FieldLabel label="Weekly Limit">
                    <input
                      value={String(category.weekly_limit)}
                      onChange={(e) => updateCategoryField(category.id, "weekly_limit", e.target.value)}
                      type="number"
                      placeholder="Weekly limit"
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <FieldLabel label="Monthly Limit">
                    <input
                      value={String(category.monthly_limit)}
                      onChange={(e) => updateCategoryField(category.id, "monthly_limit", e.target.value)}
                      type="number"
                      placeholder="Monthly limit"
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <FieldLabel label="Target Day" className="col-span-2">
                    <input
                      value={category.target_day ? String(category.target_day) : ""}
                      onChange={(e) => updateCategoryField(category.id, "target_day", e.target.value)}
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Target day"
                      className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                    />
                  </FieldLabel>
                  <label className="col-span-2 flex items-center justify-between rounded-xl border border-gray-800 bg-[#0A0F1C] px-4 py-3 text-sm text-gray-300">
                    <span>Split Across Paychecks</span>
                    <input
                      checked={category.split_across_paychecks ?? false}
                      onChange={(e) =>
                        updateCategoryField(
                          category.id,
                          "split_across_paychecks",
                          e.target.checked
                        )
                      }
                      type="checkbox"
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                </div>
                <ActionButton
                  onClick={() => saveCategory(category)}
                  className="mt-3 w-full rounded-lg"
                >
                  Save Category Budget
                </ActionButton>
              </div>
            ))}
          </div>
        </section>

        <section className={`${mobileSectionClass(["home", "spending"])} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4`}>
          <p className="text-sm text-gray-400">Can I Afford This?</p>
          <input
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            placeholder="$ amount"
            type="number"
            className="mt-2 w-full rounded-xl bg-black border border-gray-700 p-3"
          />
          <p className={canAfford ? "mt-2 text-green-400" : "mt-2 text-red-400"}>
            {canAfford ? "YES ✅ Fits your budget and cash flow" : "NO 🚫 Wait or move money first"}
          </p>
          <p className="mt-2 text-sm text-gray-400">
            If you spend this now, your Friday safe-to-spend becomes {formatCurrency(fridayNumberAfterPlanned)}.
          </p>
        </section>

        <section className={`${mobileSectionClass("spending")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4`}>
          <div className="flex justify-between">
            <p className="text-sm text-gray-400">Weekly Budget</p>
            <p className="text-sm">
              ${weeklySpentTotal.toFixed(2)} / ${weeklyBudgetTotal.toFixed(2)}
            </p>
          </div>

          <div className="mt-3 space-y-3">
            {categoryRows
              .filter((cat) => cat.weekly_limit > 0)
              .map((cat) => (
                <div key={cat.id} className="rounded-xl bg-black/40 p-3">
                  <div className="flex justify-between text-sm">
                    <span>{cat.name}</span>
                    <span
                      className={
                        cat.status === "STOP"
                          ? "text-red-400"
                          : cat.status === "CAUTION"
                          ? "text-yellow-400"
                          : "text-green-400"
                      }
                    >
                      {cat.status}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400">
                    ${cat.weeklySpent.toFixed(2)} spent • ${cat.weeklyRemaining.toFixed(2)} left
                  </p>

                  <div className="mt-2 h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400"
                      style={{
                        width: `${Math.min(cat.weeklyPercent, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section className={`${mobileSectionClass("home")} rounded-[1.75rem] border border-red-400/25 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4`}>
          <p className="text-sm text-gray-400">Overspending Defense</p>

          <p className="mt-2 text-xs text-gray-500">
            Watches your likely impulse-spend categories and flags the ones running hot this week.
          </p>

          <div className="mt-3 space-y-3">
            {overspendingDefense.length > 0 ? (
              overspendingDefense.map((cat) => (
                <div key={cat.id} className="rounded-xl border border-red-500/10 bg-black/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-50">{cat.name}</p>
                      <p className="text-xs text-gray-400">
                        {formatCurrency(cat.weeklySpent)} spent this week • {formatCurrency(cat.monthlySpent)} this month
                      </p>
                    </div>
                    <span
                      className={
                        cat.alert === "Over"
                          ? "rounded-full bg-red-500/15 px-2 py-1 text-xs text-red-300"
                          : cat.alert === "Caution" || cat.alert === "Stop"
                            ? "rounded-full bg-yellow-500/15 px-2 py-1 text-xs text-yellow-300"
                            : "rounded-full bg-cyan-500/15 px-2 py-1 text-xs text-cyan-300"
                      }
                    >
                      {cat.alert}
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className={
                        cat.weeklyRemaining < 0
                          ? "h-full bg-red-400"
                          : cat.weeklyPercent >= 80
                            ? "h-full bg-yellow-400"
                            : "h-full bg-cyan-400"
                      }
                      style={{ width: `${Math.min(cat.weeklyPercent, 100)}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>{formatCurrency(cat.weeklyRemaining)} left this week</span>
                    <span>
                      {cat.monthlyPaceOverrun > 0
                        ? `${formatCurrency(cat.monthlyPaceOverrun)} over pace`
                        : `${formatCurrency(Math.abs(cat.monthlyPaceOverrun))} under pace`}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState tone="warning">
                No risky categories detected yet. Add categories like Dining Out, Shopping, or Entertainment to start tracking them.
              </EmptyState>
            )}
          </div>
        </section>

        <section className={`${mobileSectionClass(["home", "spending"])} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3`}>
          <p className="text-sm text-gray-400">Monthly Budget</p>
          <p className="text-2xl mt-1">
            ${monthlySpentTotal.toFixed(2)} / ${monthlyBudgetTotal.toFixed(2)}
          </p>
          <p
            className={
              monthlyBudgetTotal - monthlySpentTotal < 0
                ? "text-red-400"
                : "text-green-400"
            }
          >
            ${(monthlyBudgetTotal - monthlySpentTotal).toFixed(2)} remaining this month
          </p>
        </section>

        <section className={`${mobileSectionClass("plan")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-400">Savings Goals</p>
              <p className="mt-1 text-xs text-gray-500">
                {formatCurrency(totalSavingsCurrent)} saved across {savingsGoals.length} goal{savingsGoals.length === 1 ? "" : "s"}
              </p>
            </div>
            <p className="text-sm text-emerald-300">
              {formatCurrency(totalSavingsGoal)}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-gray-700 bg-black/30 p-3">
            <p className="text-sm text-gray-300">Add Savings Goal</p>
            <div className="mt-3 grid gap-2">
              <input
                value={newSavingsGoalName}
                onChange={(e) => setNewSavingsGoalName(e.target.value)}
                placeholder="Goal name"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
              <input
                value={newSavingsGoalTarget}
                onChange={(e) => setNewSavingsGoalTarget(e.target.value)}
                type="number"
                placeholder="Target amount"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
              <label className="flex items-center justify-between rounded-xl border border-gray-800 bg-[#0A0F1C] px-4 py-3 text-sm text-gray-300">
                <span>Create matching budget row</span>
                <input
                  checked={newSavingsGoalCreateBudgetRow}
                  onChange={(e) => setNewSavingsGoalCreateBudgetRow(e.target.checked)}
                  type="checkbox"
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>
              {newSavingsGoalCreateBudgetRow ? (
                <input
                  value={newSavingsGoalBudgetTarget}
                  onChange={(e) => setNewSavingsGoalBudgetTarget(e.target.value)}
                  type="number"
                  placeholder="Monthly budget target"
                  className="w-full rounded-xl bg-black border border-gray-700 p-3"
                />
              ) : null}
              <ActionButton
                onClick={() => void addSavingsGoal()}
                className="w-full"
              >
                Add Goal
              </ActionButton>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {savingsGoals.map((goal) => {
              const goalProgress =
                Number(goal.goal || 0) > 0
                  ? Math.min((Number(goal.current || 0) / Number(goal.goal || 1)) * 100, 100)
                  : 0;

              return (
                <div key={goal.id} className="rounded-xl border border-gray-800 bg-black/30 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                      {goal.linked_category_id ? "Linked to budget" : "Not in budget yet"}
                    </p>
                    {!goal.linked_category_id ? (
                      <ActionButton
                        onClick={async () => {
                          const linkedCategory = await saveLinkedSavingsCategory({
                            savingsGoalName: goal.name,
                            initialMonthlyTarget: 0,
                          });

                          if (!linkedCategory) return;

                          const { data: linkedSavingsData, error: linkError } = await supabase
                            .from("savings")
                            .update({ linked_category_id: linkedCategory.id })
                            .eq("id", goal.id)
                            .select()
                            .single();

                          if (linkError) {
                            logSupabaseError("Failed to back-link savings goal to budget category", linkError, {
                              savingsId: goal.id,
                              linkedCategoryId: linkedCategory.id,
                            });
                            setSyncError(getErrorMessage(linkError));
                            return;
                          }

                          if (linkedSavingsData) {
                            setSavingsGoals((current) =>
                              current.map((entry) =>
                                entry.id === goal.id ? (linkedSavingsData as Savings) : entry
                              )
                            );
                          }

                          setSyncError(null);
                          pushToast("Budget row created for savings goal.");
                        }}
                        tone="ghost"
                        className="px-3 py-1 text-xs"
                      >
                        Create Budget Row
                      </ActionButton>
                    ) : null}
                  </div>
                  <input
                    value={goal.name}
                    onChange={(e) =>
                      setSavingsGoals((current) =>
                        current.map((entry) =>
                          entry.id === goal.id
                            ? { ...entry, name: e.target.value }
                            : entry
                        )
                      )
                    }
                    className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3 text-slate-50"
                  />
                  <p className="mt-3 text-xl">
                    {formatCurrency(Number(goal.current || 0))} / {formatCurrency(Number(goal.goal || 0))}
                  </p>

                  <div className="mt-2 h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full bg-green-400"
                      style={{ width: `${goalProgress}%` }}
                    />
                  </div>

                  <label className="mt-3 block text-sm text-gray-300">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                      Goal Target
                    </span>
                    <div className="flex gap-2">
                      <input
                        value={savingsGoalEdits[goal.id] ?? String(Number(goal.goal || 0))}
                        onChange={(e) =>
                          setSavingsGoalEdits((current) => ({
                            ...current,
                            [goal.id]: e.target.value,
                          }))
                        }
                        type="number"
                        className="w-full rounded-xl bg-black border border-gray-700 p-3"
                      />
                      <ActionButton
                        onClick={() =>
                          void updateSavingsGoal(
                            goal.id,
                            Math.max(Number(savingsGoalEdits[goal.id] || 0), 0),
                            goal.name
                          )
                        }
                        className="shrink-0"
                      >
                        Save
                      </ActionButton>
                    </div>
                  </label>

                  <label className="mt-3 block text-sm text-gray-300">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                      Add Or Remove Amount
                    </span>
                    <input
                      value={savingsAdjustmentInputs[goal.id] || ""}
                      onChange={(e) =>
                        setSavingsAdjustmentInputs((current) => ({
                          ...current,
                          [goal.id]: e.target.value,
                        }))
                      }
                      type="number"
                      placeholder="Use negative numbers to subtract"
                      className="w-full rounded-xl bg-black border border-gray-700 p-3"
                    />
                  </label>

                  <div className="mt-3 flex gap-2">
                    <ActionButton
                      onClick={() => void applySavingsAdjustment(goal.id)}
                      tone="secondary"
                      className="flex-1 border-green-400 py-2 text-green-300"
                    >
                      Apply Change
                    </ActionButton>
                    <ActionButton
                      onClick={() => void resetSavingsBalance(goal.id)}
                      tone="danger"
                    >
                      Reset
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`${mobileSectionClass("plan")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-6`}>
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-400">Debt Payoff</p>
            <button
              onClick={loadDebtPreset}
              className="rounded-lg border border-cyan-400 px-3 py-1 text-xs text-cyan-300"
            >
              Load My Debts
            </button>
          </div>

          <p className="mt-2 text-2xl">{formatCurrency(totalDebt)}</p>
          <p className="text-sm text-gray-400">
            {debts.length
              ? `${debtStrategy === "snowball" ? "Snowball" : "Avalanche"} plan: ${payoffPlan.months} months`
              : "Add debts to calculate a payoff plan"}
          </p>

          <div className="mt-4 rounded-xl bg-black/30 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setDebtStrategy("snowball")}
                className={
                  debtStrategy === "snowball"
                    ? "rounded-lg bg-cyan-400 px-3 py-2 font-semibold text-black"
                    : "rounded-lg border border-gray-700 px-3 py-2 text-gray-300"
                }
              >
                Snowball
              </button>
              <button
                onClick={() => setDebtStrategy("avalanche")}
                className={
                  debtStrategy === "avalanche"
                    ? "rounded-lg bg-cyan-400 px-3 py-2 font-semibold text-black"
                    : "rounded-lg border border-gray-700 px-3 py-2 text-gray-300"
                }
              >
                Avalanche
              </button>
            </div>

            <label className="block text-sm text-gray-300">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                Extra Monthly Debt Payment
              </span>
              <input
                value={extraDebtPayment}
                onChange={(e) => setExtraDebtPayment(e.target.value)}
                placeholder="Extra monthly debt payment"
                type="number"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
            </label>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
                <p className="text-gray-400">Minimums</p>
                <p>{formatCurrency(totalMinimumDebtPayment)}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
                <p className="text-gray-400">Extra</p>
                <p>{formatCurrency(Number(extraDebtPayment || 0))}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
                <p className="text-gray-400">Debt-Free</p>
                <p>{debts.length ? formatMonthYear(payoffPlan.debtFreeDate) : "--"}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-black/40 p-3">
                <p className="text-gray-400">Interest</p>
                <p>{formatCurrency(payoffPlan.totalInterest)}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-gray-700 bg-black/30 p-3 space-y-3">
            <p className="text-sm text-gray-400">Add Debt</p>

            <label className="block text-sm text-gray-300">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                Debt Name
              </span>
              <input
                value={newDebtName}
                onChange={(e) => setNewDebtName(e.target.value)}
                placeholder="Debt name"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
            </label>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="text-sm text-gray-300">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                  Remaining Balance
                </span>
                <input
                  value={newDebtBalance}
                  onChange={(e) => setNewDebtBalance(e.target.value)}
                  placeholder="Balance"
                  type="number"
                  className="w-full rounded-xl bg-black border border-gray-700 p-3"
                />
              </label>
              <label className="text-sm text-gray-300">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                  Interest Rate
                </span>
                <input
                  value={newDebtInterest}
                  onChange={(e) => setNewDebtInterest(e.target.value)}
                  placeholder="APR %"
                  type="number"
                  className="w-full rounded-xl bg-black border border-gray-700 p-3"
                />
              </label>
              <label className="text-sm text-gray-300">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                  Monthly Payment
                </span>
                <input
                  value={newDebtMinPayment}
                  onChange={(e) => setNewDebtMinPayment(e.target.value)}
                  placeholder="Min pay"
                  type="number"
                  className="w-full rounded-xl bg-black border border-gray-700 p-3"
                />
              </label>
            </div>

            <ActionButton
              onClick={addDebt}
              className="w-full"
            >
              Save Debt
            </ActionButton>
          </div>

          {payoffPlan.payoffOrder.length > 0 ? (
            <div className="mt-4 rounded-xl border border-gray-700 bg-black/30 p-3">
              <p className="text-sm text-gray-400">Payoff Order</p>
              <div className="mt-2 space-y-2 text-sm">
                {payoffPlan.payoffOrder.map((entry, index) => (
                  <div key={entry.id} className="flex items-center justify-between">
                    <span>
                      {index + 1}. {entry.name}
                    </span>
                    <span className="text-gray-400">
                      {entry.dateLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {debts.map((debt) => (
              <div key={debt.id} className="rounded-xl bg-black/40 p-3 text-sm">
                <button
                  onClick={() => toggleDebtExpanded(debt.id)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base text-slate-50">{debt.name || "Unnamed debt"}</p>
                    <p className="text-xs text-gray-400">
                      Remaining {formatCurrency(Number(debt.balance || 0))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg text-cyan-300">
                      {formatCurrency(Number(debt.balance || 0))}
                    </p>
                    <p className="text-xs text-gray-500">
                      {expandedDebts[debt.id] ? "Collapse" : "Expand"}
                    </p>
                  </div>
                </button>

                {expandedDebts[debt.id] ? (
                  <>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="md:col-span-2 text-sm text-gray-300">
                        <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                          Debt Name
                        </span>
                        <input
                          value={debt.name}
                          onChange={(e) => updateDebtField(debt.id, "name", e.target.value)}
                          className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                        />
                      </label>
                      <label className="text-sm text-gray-300">
                        <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                          Remaining Balance
                        </span>
                        <input
                          value={String(debt.balance)}
                          onChange={(e) => updateDebtField(debt.id, "balance", e.target.value)}
                          type="number"
                          placeholder="Balance"
                          className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                        />
                      </label>
                      <label className="text-sm text-gray-300">
                        <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                          Interest Rate
                        </span>
                        <input
                          value={String(debt.interest)}
                          onChange={(e) => updateDebtField(debt.id, "interest", e.target.value)}
                          type="number"
                          placeholder="APR %"
                          className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                        />
                      </label>
                      <label className="md:col-span-2 text-sm text-gray-300">
                        <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
                          Monthly Payment
                        </span>
                        <input
                          value={String(debt.min_payment)}
                          onChange={(e) => updateDebtField(debt.id, "min_payment", e.target.value)}
                          type="number"
                          placeholder="Monthly payment"
                          className="w-full rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                        />
                      </label>
                    </div>

                    <p className="mt-2 text-xs text-gray-500">
                      Adjust the monthly payment here to reflect what you want this debt to receive each month.
                    </p>

                    <div className="mt-3 flex gap-2">
                      <ActionButton
                        onClick={() => saveDebt(debt)}
                        className="flex-1 rounded-lg"
                      >
                        Save
                      </ActionButton>
                      <ActionButton
                        onClick={() => deleteDebt(debt.id)}
                        tone="danger"
                        className="rounded-lg px-3"
                      >
                        Delete
                      </ActionButton>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <DashboardPanel
          className={`${mobileSectionClass("plan")} 2xl:col-span-3`}
          title="Net Worth Snapshot"
          density={workspaceDensity}
        >
          {netWorth ? (
            <>
              <p className="text-2xl">${Number(netWorth.net_worth).toFixed(2)}</p>
              <p className="text-xs text-gray-400">
                Assets ${Number(netWorth.assets).toFixed(2)} • Debts ${Number(netWorth.debts).toFixed(2)}
              </p>
            </>
          ) : (
            <p className="text-gray-400 text-sm">
              Save a snapshot to start a simple net worth trend.
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm text-gray-300">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">Assets</span>
              <input
                value={netWorthAssetsInput}
                onChange={(e) => setNetWorthAssetsInput(e.target.value)}
                type="number"
                placeholder="Total assets"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
            </label>
            <label className="text-sm text-gray-300">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">Debts</span>
              <input
                value={netWorthDebtsInput}
                onChange={(e) => setNetWorthDebtsInput(e.target.value)}
                type="number"
                placeholder="Total debts"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
            </label>
          </div>

          <button
            onClick={saveNetWorthSnapshot}
            className="mt-3 w-full rounded-xl border border-cyan-400 py-2 text-cyan-300"
          >
            Save Snapshot
          </button>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Trend</p>
            {netWorthChart.length > 0 ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {netWorthChart.map((snapshot) => {
                  const maxNetWorth = Math.max(
                    ...netWorthChart.map((entry) => Math.abs(Number(entry.net_worth))),
                    1
                  );
                  const chartHeight = Math.max(
                    (Math.abs(Number(snapshot.net_worth)) / maxNetWorth) * 96,
                    10
                  );

                  return (
                    <div key={snapshot.id} className="flex flex-col items-center gap-2">
                      <div className="flex h-28 items-end">
                        <div
                          className={
                            Number(snapshot.net_worth) >= 0
                              ? "w-8 rounded-t-lg bg-cyan-400/80"
                              : "w-8 rounded-t-lg bg-red-400/80"
                          }
                          style={{ height: `${chartHeight}px` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500">
                        {new Date(snapshot.snapshot_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No trend yet.</p>
            )}
          </div>
        </DashboardPanel>

        <DashboardPanel
          className={`${mobileSectionClass(["home", "spending"])} 2xl:col-span-3`}
          title="Recent Transactions"
          density={workspaceDensity}
        >

          <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
            <div className="flex items-end justify-between">
              {lastSevenDays.map((day) => (
                <div key={day.label} className="flex flex-col items-center gap-2">
                  <div className="flex h-24 items-end">
                    <div
                      className="w-7 rounded-t-lg bg-cyan-400/80"
                      style={{ height: `${Math.max((day.spent / maxDailySpend) * 96, day.spent > 0 ? 8 : 0)}px` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500">{day.label}</p>
                  <p className="text-[10px] text-gray-400">{formatCurrency(day.spent)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {transactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm">
                <div>
                  <p className="text-slate-50">
                    {tx.merchant?.trim() || tx.category}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {(() => {
                      const cadence = tx.merchant
                        ? detectRecurringCadence(
                            merchantHistory.get(normalizeMerchantName(tx.merchant))
                              ?.transactions || []
                          )
                        : null;

                      return cadence ? (
                        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-200">
                          {cadence}
                        </span>
                      ) : null;
                    })()}
                    {tx.merchant ? (
                      <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                        remembered
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-400">
                    {tx.category}
                    {tx.account_id
                      ? ` • ${accounts.find((account) => account.id === tx.account_id)?.name || "Account"}`
                      : ""}
                  </p>
                  {tx.memo ? (
                    <p className="text-xs text-gray-500">{tx.memo}</p>
                  ) : null}
                  <p className="text-xs text-gray-500">
                    {getTransactionDate(tx).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={
                    getTransactionType(tx) === "income"
                      ? "text-emerald-300"
                      : "text-red-300"
                  }
                >
                  {getTransactionType(tx) === "income" ? "+" : "-"}
                  {formatCurrency(Math.abs(Number(tx.amount || 0)))}
                </span>
              </div>
            ))}
            {transactions.length === 0 ? (
              <EmptyState className="px-4 py-5">
                No transactions yet. Add your first expense or income entry to start building trends, category history, and spending pace.
              </EmptyState>
            ) : null}
          </div>
        </DashboardPanel>
        </div>
        </div>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-700/80 bg-[#09101d]/95 px-3 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-5 gap-2">
              {MOBILE_TABS.map((tab) => (
                <button
                  key={`bottom-${tab.id}`}
                  onClick={() => selectMobileTab(tab.id)}
              className={
                activeMobileTab === tab.id
                  ? "flex flex-col items-center justify-center gap-1 rounded-2xl border border-cyan-400 bg-cyan-400/15 px-2 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.16)] transition-all duration-200"
                  : "flex flex-col items-center justify-center gap-1 rounded-2xl border border-slate-800 bg-slate-950/40 px-2 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-slate-500 transition-all duration-200"
              }
            >
              <AppIcon name={tab.icon} className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap text-center leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
