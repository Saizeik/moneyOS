"use client";

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
  goal: number;
  current: number;
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

type MobileTab = "home" | "budget" | "spending" | "bills" | "plan";

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

function getNextPayday(settings: PaycheckSettings, now: Date) {
  const today = startOfDay(now);

  if (settings.type === "weekly" || settings.type === "biweekly") {
    const anchor = parseLocalDate(settings.anchorDate);
    if (!anchor) return null;

    const intervalDays = settings.type === "weekly" ? 7 : 14;
    const candidate = startOfDay(anchor);

    while (candidate < today) {
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

    if (currentMonthPayday >= today) {
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

  return candidates.find((candidate) => candidate >= today) || null;
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
  maxOccurrences = 6
) {
  const paydays: Date[] = [];
  let cursor = startOfDay(now);

  for (let index = 0; index < maxOccurrences; index += 1) {
    const nextPayday = getNextPayday(settings, cursor);

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
  splitAcrossPaychecks: boolean
) {
  if (!dueDate || amount <= 0) return 0;

  if (splitAcrossPaychecks) {
    const paydaysRemaining = getPaydaysThroughDate(settings, now, dueDate).length;
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

const MOBILE_TABS: Array<{ id: MobileTab; label: string; icon: string }> = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "budget", label: "Budget", icon: "$" },
  { id: "spending", label: "Spending", icon: "+" },
  { id: "bills", label: "Bills", icon: "◷" },
  { id: "plan", label: "Plan", icon: "◎" },
];

const OVESPENDING_KEYWORDS = [
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
  const [savings, setSavings] = useState<Savings | null>(null);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorthSnapshot | null>(null);
  const [netWorthHistory, setNetWorthHistory] = useState<NetWorthSnapshot[]>([]);

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
  const [assignedBudget, setAssignedBudget] = useState<Record<string, number>>({});
  const [assignmentSyncReady, setAssignmentSyncReady] = useState(false);
  const [paycheckSettings, setPaycheckSettings] = useState<PaycheckSettings>(
    DEFAULT_PAYCHECK_SETTINGS
  );
  const [paycheckSyncReady, setPaycheckSyncReady] = useState(false);
  const [expandedDebts, setExpandedDebts] = useState<Record<string, boolean>>({});
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>("home");
  const [netWorthAssetsInput, setNetWorthAssetsInput] = useState("");
  const [netWorthDebtsInput, setNetWorthDebtsInput] = useState("");
  const [savingsGoalInput, setSavingsGoalInput] = useState("");
  const [savingsAdjustmentInput, setSavingsAdjustmentInput] = useState("");

  function syncSavingsState(nextSavings: Savings | null) {
    setSavings(nextSavings);
    setSavingsGoalInput(String(Number(nextSavings?.goal || 1000)));
  }

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
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedIncome = window.localStorage.getItem("money-os:income");

    if (storedIncome) {
      const frame = window.requestAnimationFrame(() => {
        setMonthlyIncomeInput(storedIncome);
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("money-os:income", monthlyIncomeInput || "0");
  }, [monthlyIncomeInput]);

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
      const [txRes, accountRes, categoryRes, debtRes, billRes, netWorthRes, assignmentRes, paycheckRes] =
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
        .maybeSingle();

      if (savingsError) {
        logSupabaseError("Failed to load savings", savingsError);
        setSyncError(getErrorMessage(savingsError));
        setLoading(false);
        return;
      }

      if (!savingsData) {
        const { data: newSavings, error: newSavingsError } = await supabase
          .from("savings")
          .insert([{ user_id: uid, goal: 1000, current: 0 }])
          .select()
          .single();

        if (newSavingsError) {
          logSupabaseError("Failed to create savings row", newSavingsError, {
            userId: uid,
          });
          setSyncError(getErrorMessage(newSavingsError));
        }

        syncSavingsState(newSavings);
      } else {
        syncSavingsState(savingsData);
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

    if (data) setTransactions([data, ...transactions]);
    setSyncError(null);
    setAmount("");
    setTransactionMerchant("");
    setTransactionMemo("");
    setTransactionDateInput(formatInputDate(new Date()));
    setTransactionType("expense");
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
  };

  const updateSavings = async (newAmount: number) => {
    if (!savings) return;

    const { data, error } = await supabase
      .from("savings")
      .update({ current: newAmount })
      .eq("id", savings.id)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to update savings", error, {
        savingsId: savings.id,
        current: newAmount,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) syncSavingsState(data);
    setSyncError(null);
  };

  const updateSavingsGoal = async (newGoal: number) => {
    if (!savings) return;

    const { data, error } = await supabase
      .from("savings")
      .update({ goal: newGoal })
      .eq("id", savings.id)
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to update savings goal", error, {
        savingsId: savings.id,
        goal: newGoal,
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) syncSavingsState(data);
    setSyncError(null);
  };

  const applySavingsAdjustment = async () => {
    if (!savings) return;
    const adjustment = Number(savingsAdjustmentInput || 0);
    const nextAmount = Math.max(Number(savings.current || 0) + adjustment, 0);

    await updateSavings(nextAmount);
    setSavingsAdjustmentInput("");
  };

  const resetSavingsBalance = async () => {
    await updateSavings(0);
    setSavingsAdjustmentInput("");
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
  const nextPayday = getNextPayday(paycheckSettings, now);
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
        paycheckSettings,
        now,
        nextPayday,
        bill.split_across_paychecks ?? false
      );

      return sum + reserveAmount;
    }, 0);

  const protectedBuffer = 50;

  const availableCash =
    currentBankBalance - billsReservedForAvailableCash - protectedBuffer;

  const totalDebt = debts.reduce((sum, debt) => sum + Number(debt.balance), 0);

  const savingsProgress = savings
    ? Math.min((Number(savings.current) / Number(savings.goal)) * 100, 100)
    : 0;

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
        paycheckSettings,
        now,
        nextPayday,
        bill.split_across_paychecks ?? false
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
              paycheckSettings,
              now,
              nextPayday,
              category.split_across_paychecks ?? false
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
  const cashAvailableUntilPayday = Math.max(
    currentBankBalance - cashReservedUntilPayday,
    0
  );
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
    dailySafeToSpend > 0
      ? Math.max(Math.floor(cashAvailableUntilPayday / dailySafeToSpend), 0)
      : cashAvailableUntilPayday > 0
        ? daysUntilPaydayWindow
        : 0;
  const cashCoversUntilPayday = currentBankBalance >= cashReservedUntilPayday;
  const safeToSpendStatus =
    safeToSpend <= 0
      ? "Overspending risk 🚨"
      : `${formatCurrency(dailySafeToSpend)} safe today • ${formatCurrency(safeThisWeek)} safe this week • ${formatCurrency(Math.max(readyToAssign, 0))} still unassigned`;
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
      ? "block translate-y-0 opacity-100 transition-all duration-200 lg:block"
      : "hidden lg:block";
  };
  const selectMobileTab = (tab: MobileTab) => {
    setActiveMobileTab(tab);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
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
  const canAfford =
    Number(planned || 0) <= safeToSpend &&
    Number(planned || 0) <= availableCash;

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
  };

  const resetAssignments = () => {
    void commitAssignedBudget({});
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

          <div className="mt-6 hidden gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:items-end lg:grid">
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
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Safe Today</p>
                <p className="mt-3 text-3xl text-slate-50">{formatCurrency(dailySafeToSpend)}</p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Safe This Week</p>
                <p className={safeThisWeek <= 0 ? "mt-3 text-3xl text-red-400" : "mt-3 text-3xl text-slate-50"}>
                  {formatCurrency(safeThisWeek)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Bank Balance</p>
                <p className="mt-3 text-3xl text-slate-50">{formatCurrency(currentBankBalance)}</p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Available Cash</p>
                <p className={availableCash < 0 ? "mt-3 text-3xl text-red-400" : "mt-3 text-3xl text-slate-50"}>
                  {formatCurrency(availableCash)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Next Payday</p>
                <p className="mt-3 text-2xl text-slate-50">
                  {nextPayday ? formatMonthYear(nextPayday) : "Set schedule"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Ready To Assign</p>
                <p className={readyToAssign < 0 ? "mt-3 text-3xl text-red-400" : "mt-3 text-3xl text-emerald-400"}>
                  {formatCurrency(readyToAssign)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Safe By Friday</p>
                <p className="mt-3 text-3xl text-slate-50">{formatCurrency(fridayNumberAfterPlanned)}</p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Underfunded</p>
                <p className="mt-3 text-3xl text-slate-50">{formatCurrency(underfundedTotal)}</p>
              </div>
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
              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Safe Today</p>
                <p className="mt-2 text-2xl text-slate-50">{formatCurrency(dailySafeToSpend)}</p>
              </div>
              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Available Cash</p>
                <p className={availableCash < 0 ? "mt-2 text-2xl text-red-400" : "mt-2 text-2xl text-slate-50"}>
                  {formatCurrency(availableCash)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Next Payday</p>
                <p className="mt-2 text-xl text-slate-50">
                  {nextPayday ? nextPayday.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Set schedule"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Ready To Assign</p>
                <p className={readyToAssign < 0 ? "mt-2 text-2xl text-red-400" : "mt-2 text-2xl text-emerald-400"}>
                  {formatCurrency(readyToAssign)}
                </p>
              </div>
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
              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">This Week</p>
                <p className={safeThisWeek <= 0 ? "mt-2 text-2xl text-red-400" : "mt-2 text-2xl text-slate-50"}>
                  {formatCurrency(safeThisWeek)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Underfunded</p>
                <p className="mt-2 text-2xl text-slate-50">{formatCurrency(underfundedTotal)}</p>
              </div>
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
                  <span className="text-sm leading-none">{tab.icon}</span>
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
                ? "Daily overview and alerts"
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

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-12">
        <section className={`${mobileSectionClass("budget")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-5`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">Budget Planner</p>
            <p className={readyToAssign < 0 ? "text-sm text-red-400" : "text-sm text-green-400"}>
              {readyToAssign < 0 ? "Over-assigned" : "Ready to assign"} {formatCurrency(Math.abs(readyToAssign))}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
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
        </section>

        <section className={`${mobileSectionClass("bills")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-7`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">Paycheck Calendar</p>
            <p className={cashCoversUntilPayday ? "text-sm text-emerald-400" : "text-sm text-red-400"}>
              {cashCoversUntilPayday ? "Covered to payday" : "Short before payday"}
            </p>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-gray-300">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">Pay schedule</span>
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
                </label>

                {(paycheckSettings.type === "weekly" ||
                  paycheckSettings.type === "biweekly") ? (
                  <label className="text-sm text-gray-300">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">Known payday</span>
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
                  </label>
                ) : null}

                {paycheckSettings.type === "monthly" ? (
                  <label className="text-sm text-gray-300">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">Day of month</span>
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
                  </label>
                ) : null}

                {paycheckSettings.type === "twice_monthly" ? (
                  <>
                    <label className="text-sm text-gray-300">
                      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">First payday</span>
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
                    </label>
                    <label className="text-sm text-gray-300">
                      <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">Second payday</span>
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
                    </label>
                  </>
                ) : null}
              </div>

              <button
                onClick={() => void savePaycheckSettings()}
                className="mt-3 w-full rounded-xl border border-cyan-400 py-2 text-cyan-300"
              >
                {paycheckSyncReady ? "Save Paycheck Settings" : "Loading Paycheck Settings"}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </section>

        <section className={`${mobileSectionClass("bills")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-4`}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Account Balance Trend</p>
            <p className="text-xs text-gray-500">Estimated last 7 days</p>
          </div>

          <div className="mt-4 grid grid-cols-7 items-end gap-2">
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
        </section>

        <section className={`${mobileSectionClass("bills")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-4`}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Cash vs Bills Due</p>
            <p className="text-xs text-gray-500">Before next paycheck</p>
          </div>

          <div className="mt-3 space-y-3">
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
              <p className="text-sm text-gray-500">No cash-counting bills are due before your next paycheck.</p>
            )}
          </div>
        </section>

        <section className={`${mobileSectionClass("spending")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-4`}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Category Breakdown</p>
            <p className="text-xs text-gray-500">Month to date</p>
          </div>

          <div className="mt-3 space-y-3">
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
              <p className="text-sm text-gray-500">No category spending has been recorded this month yet.</p>
            )}
          </div>
        </section>

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
                        <input
                          value={String(item.assigned)}
                          onChange={(e) => updateAssignedBudget(item.key, e.target.value)}
                          type="number"
                          className="rounded-lg border border-gray-700 bg-black p-2"
                        />
                        {isManagedBill ? (
                          <button
                            onClick={() => selectMobileTab("bills")}
                            className="rounded-lg border border-slate-600 px-3 py-2 text-slate-300"
                          >
                            Edit In Bills
                          </button>
                        ) : (
                          <button
                            onClick={() => void saveBudgetItemTarget(item.key)}
                            className="rounded-lg border border-slate-600 px-3 py-2 text-slate-300"
                          >
                            Save Target
                          </button>
                        )}
                        <button
                          onClick={() => fundItem(item.key, Math.min(item.needed, Math.max(readyToAssign, 0)))}
                          className="rounded-lg border border-cyan-400 px-3 py-2 text-cyan-300"
                        >
                          Fund
                        </button>
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
          <button
            onClick={updateMainBalance}
            className="w-full rounded-xl border border-cyan-400 py-2 text-cyan-300"
          >
            Save Balance
          </button>
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
            onChange={(e) => setTransactionMerchant(e.target.value)}
            placeholder="Merchant or source"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

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

          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={transactionType === "income" ? "Income amount" : "Expense amount"}
            type="number"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

          <button
            onClick={addTransaction}
            className="w-full rounded-xl bg-cyan-400 py-2 font-bold text-black"
          >
            Add Transaction
          </button>
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

          <button
            onClick={addCategory}
            disabled={!canSubmitCategory}
            className={
              canSubmitCategory
                ? "w-full rounded-xl border border-cyan-400 py-3 text-cyan-300"
                : "w-full rounded-xl border border-gray-700 py-3 text-gray-500"
            }
          >
            {categorySubmitting ? "Saving Category..." : "Save Category"}
          </button>
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
                  <input
                    value={bill.name}
                    onChange={(e) => updateBillField(bill.id, "name", e.target.value)}
                    className="col-span-2 rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
                  <input
                    value={String(bill.amount)}
                    onChange={(e) => updateBillField(bill.id, "amount", e.target.value)}
                    type="number"
                    placeholder="Amount"
                    className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
                  <input
                    value={String(bill.due_day)}
                    onChange={(e) => updateBillField(bill.id, "due_day", e.target.value)}
                    type="number"
                    placeholder="Due day"
                    className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
                  <input
                    value={bill.category}
                    onChange={(e) => updateBillField(bill.id, "category", e.target.value)}
                    className="col-span-2 rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
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
                <button
                  onClick={() => saveBill(bill)}
                  className="mt-3 w-full rounded-lg border border-cyan-400 py-2 text-cyan-300"
                >
                  Save Bill
                </button>
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
                  <input
                    value={category.name}
                    onChange={(e) => updateCategoryField(category.id, "name", e.target.value)}
                    className="col-span-2 rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
                  <input
                    value={category.group_name}
                    onChange={(e) => updateCategoryField(category.id, "group_name", e.target.value)}
                    className="col-span-2 rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
                  <input
                    value={String(category.weekly_limit)}
                    onChange={(e) => updateCategoryField(category.id, "weekly_limit", e.target.value)}
                    type="number"
                    placeholder="Weekly limit"
                    className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
                  <input
                    value={String(category.monthly_limit)}
                    onChange={(e) => updateCategoryField(category.id, "monthly_limit", e.target.value)}
                    type="number"
                    placeholder="Monthly limit"
                    className="rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
                  <input
                    value={category.target_day ? String(category.target_day) : ""}
                    onChange={(e) => updateCategoryField(category.id, "target_day", e.target.value)}
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Target day"
                    className="col-span-2 rounded-xl bg-[#0A0F1C] border border-gray-700 p-3"
                  />
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
                <button
                  onClick={() => saveCategory(category)}
                  className="mt-3 w-full rounded-lg border border-cyan-400 py-2 text-cyan-300"
                >
                  Save Category Budget
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={`${mobileSectionClass("spending")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4`}>
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
              <p className="text-sm text-gray-500">
                No risky categories detected yet. Add categories like Dining Out, Shopping, or Entertainment to start tracking them.
              </p>
            )}
          </div>
        </section>

        <section className={`${mobileSectionClass("spending")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3`}>
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
          <p className="text-sm text-gray-400">Emergency Fund</p>
          <p className="text-2xl">
            ${Number(savings?.current || 0).toFixed(2)} / ${Number(savings?.goal || 1000).toFixed(2)}
          </p>

          <div className="mt-2 h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-green-400"
              style={{ width: `${savingsProgress}%` }}
            />
          </div>

          <label className="mt-3 block text-sm text-gray-300">
            <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
              Savings Goal
            </span>
            <div className="flex gap-2">
              <input
                value={savingsGoalInput}
                onChange={(e) => setSavingsGoalInput(e.target.value)}
                type="number"
                className="w-full rounded-xl bg-black border border-gray-700 p-3"
              />
              <button
                onClick={() => void updateSavingsGoal(Math.max(Number(savingsGoalInput || 0), 0))}
                className="rounded-xl border border-cyan-400 px-4 py-2 text-cyan-300"
              >
                Save
              </button>
            </div>
          </label>

          <label className="mt-3 block text-sm text-gray-300">
            <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-gray-500">
              Add Or Remove Amount
            </span>
            <input
              value={savingsAdjustmentInput}
              onChange={(e) => setSavingsAdjustmentInput(e.target.value)}
              type="number"
              placeholder="Use negative numbers to subtract"
              className="w-full rounded-xl bg-black border border-gray-700 p-3"
            />
          </label>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void applySavingsAdjustment()}
              className="flex-1 rounded-xl border border-green-400 py-2 text-green-300"
            >
              Apply Change
            </button>
            <button
              onClick={() => void resetSavingsBalance()}
              className="rounded-xl border border-red-500/50 px-4 py-2 text-red-300"
            >
              Reset
            </button>
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

            <button
              onClick={addDebt}
              className="w-full rounded-xl border border-cyan-400 py-2 text-cyan-300"
            >
              Save Debt
            </button>
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
                      <button
                        onClick={() => saveDebt(debt)}
                        className="flex-1 rounded-lg border border-cyan-400 py-2 text-cyan-300"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => deleteDebt(debt.id)}
                        className="rounded-lg border border-red-500/50 px-3 py-2 text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className={`${mobileSectionClass("plan")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3`}>
          <p className="text-sm text-gray-400">Net Worth Snapshot</p>
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
        </section>

        <section className={`${mobileSectionClass("spending")} rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3`}>
          <p className="text-sm text-gray-400 mb-2">Recent Transactions</p>

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
              <p className="text-sm text-gray-500">No transactions yet.</p>
            ) : null}
          </div>
        </section>
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
              <span className="text-sm leading-none">{tab.icon}</span>
              <span className="whitespace-nowrap text-center leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
