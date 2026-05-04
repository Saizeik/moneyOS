"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Transaction = {
  id: string;
  amount: number;
  category: string;
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
  { name: "Groceries", group_name: "Needs", weekly_limit: 100, monthly_limit: 400 },
  { name: "Transportation", group_name: "Needs", weekly_limit: 20, monthly_limit: 80 },
  { name: "Car Maintenance", group_name: "Needs", weekly_limit: 0, monthly_limit: 0 },
  { name: "Emergency Fund", group_name: "Savings", weekly_limit: 21, monthly_limit: 83.34 },
  { name: "Eating Out", group_name: "Overspending Defense", weekly_limit: 25, monthly_limit: 100 },
  { name: "Convenience Stores", group_name: "Overspending Defense", weekly_limit: 12.5, monthly_limit: 50 },
  { name: "Kids", group_name: "Family", weekly_limit: 25, monthly_limit: 100 },
  { name: "Misc", group_name: "Flexible", weekly_limit: 25, monthly_limit: 100 },
  { name: "Credit Card Payments", group_name: "Debt", weekly_limit: 0, monthly_limit: 62.97 },
  { name: "Rent", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 1495 },
  { name: "Utilities", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 0 },
  { name: "TV, Phone and Internet", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 50 },
  { name: "Insurance", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 0 },
  { name: "Auto Loans", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 293 },
  { name: "Personal Loans", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 122.83 },
  { name: "Buy Now, Pay Later", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 577.64 },
  { name: "Music", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 10.99 },
  { name: "Netflix and Disney Plus", group_name: "Fixed Bills", weekly_limit: 0, monthly_limit: 33.54 },
];

const DEFAULT_BILLS = [
  { name: "Rent", amount: 1495, due_day: 31, category: "Rent", counts_toward_available_cash: true },
  { name: "Utilities", amount: 0, due_day: 31, category: "Utilities", counts_toward_available_cash: true },
  { name: "TV, Phone and Internet", amount: 50, due_day: 23, category: "TV, Phone and Internet", counts_toward_available_cash: true },
  { name: "Insurance", amount: 0, due_day: 31, category: "Insurance", counts_toward_available_cash: true },
  { name: "Auto Loans", amount: 293, due_day: 11, category: "Auto Loans", counts_toward_available_cash: false },
  { name: "Personal Loans", amount: 122.83, due_day: 19, category: "Personal Loans", counts_toward_available_cash: false },
  { name: "Buy Now, Pay Later", amount: 577.64, due_day: 31, category: "Buy Now, Pay Later", counts_toward_available_cash: false },
  { name: "Music", amount: 10.99, due_day: 18, category: "Music", counts_toward_available_cash: true },
  { name: "Netflix and Disney Plus", amount: 33.54, due_day: 23, category: "Netflix and Disney Plus", counts_toward_available_cash: true },
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

  const [amount, setAmount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Groceries");
  const [planned, setPlanned] = useState("");
  const [bankBalanceInput, setBankBalanceInput] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryGroup, setNewCategoryGroup] = useState("Flexible");
  const [newCategoryWeeklyLimit, setNewCategoryWeeklyLimit] = useState("");
  const [newCategoryMonthlyLimit, setNewCategoryMonthlyLimit] = useState("");
  const [newBillName, setNewBillName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillDueDay, setNewBillDueDay] = useState("");
  const [newBillCategory, setNewBillCategory] = useState("Rent");
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
            .limit(1)
            .maybeSingle(),

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
      setNetWorth(netWorthRes.data || null);

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

        setSavings(newSavings);
      } else {
        setSavings(savingsData);
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

    const { data, error } = await supabase
      .from("transactions")
      .insert([
        {
          amount: Number(amount),
          category: selectedCategory,
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
      });
      setSyncError(getErrorMessage(error));
      return;
    }

    if (data) setTransactions([data, ...transactions]);
    setSyncError(null);
    setAmount("");
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

    if (data) setSavings(data);
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
    field: keyof Pick<RecurringBill, "name" | "amount" | "due_day" | "category" | "counts_toward_available_cash">,
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
                  : field === "counts_toward_available_cash"
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
    setSyncError(null);
  };

  const updateCategoryField = (
    categoryId: string,
    field: keyof Pick<BudgetCategory, "name" | "group_name" | "weekly_limit" | "monthly_limit">,
    value: string
  ) => {
    setCategories((currentCategories) =>
      currentCategories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              [field]:
                field === "name" || field === "group_name"
                  ? value
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

  const addCategory = async () => {
    if (!userId) return;

    const trimmedName = newCategoryName.trim();
    const trimmedGroup = newCategoryGroup.trim() || "Flexible";

    if (!trimmedName) {
      setSyncError("Category name is required.");
      return;
    }

    const duplicate = categories.some(
      (category) => category.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      setSyncError("That category already exists.");
      return;
    }

    const weeklyLimit = Number(newCategoryWeeklyLimit || 0);
    const monthlyLimit = Number(newCategoryMonthlyLimit || 0);

    const { data, error } = await supabase
      .from("budget_categories")
      .insert([
        {
          user_id: userId,
          name: trimmedName,
          group_name: trimmedGroup,
          weekly_limit: weeklyLimit,
          monthly_limit: monthlyLimit,
          priority: categories.length + 1,
          rollover: false,
        },
      ])
      .select()
      .single();

    if (error) {
      logSupabaseError("Failed to add category", error, {
        userId,
        name: trimmedName,
        group_name: trimmedGroup,
        weekly_limit: weeklyLimit,
        monthly_limit: monthlyLimit,
      });
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
    setSyncError(null);
  };

  const now = new Date();

  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - now.getDay());

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const weeklyTransactions = transactions.filter(
    (t) => new Date(t.created_at) >= startOfWeek
  );

  const monthlyTransactions = transactions.filter(
    (t) => new Date(t.created_at) >= startOfMonth
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
    (sum, tx) => sum + Number(tx.amount),
    0
  );

  const monthlySpentTotal = monthlyTransactions.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0
  );
  const monthlyIncome = Number(monthlyIncomeInput || 0);

  const currentBankBalance = accounts[0]?.current_balance || 0;

  const unpaidBillsThisMonth = bills
    .filter(
      (bill) =>
        !bill.is_paid &&
        (bill.counts_toward_available_cash ?? true)
    )
    .reduce((sum, bill) => sum + Number(bill.amount), 0);

  const protectedBuffer = 50;

  const availableCash =
    currentBankBalance - unpaidBillsThisMonth - protectedBuffer;

  const totalDebt = debts.reduce((sum, debt) => sum + Number(debt.balance), 0);

  const savingsProgress = savings
    ? Math.min((Number(savings.current) / Number(savings.goal)) * 100, 100)
    : 0;

  const categoryRows = categories.map((cat) => {
    const weeklySpent = weeklyTransactions
      .filter((tx) => tx.category === cat.name)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

    const monthlySpent = monthlyTransactions
      .filter((tx) => tx.category === cat.name)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

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

  const overspendingDefense = categoryRows.filter(
    (cat) =>
      cat.group_name === "Overspending Defense" ||
      cat.name === "Eating Out" ||
      cat.name === "Convenience Stores"
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

      return {
        key,
        group: "Bills",
        name: bill.name,
        target,
        assigned,
        activity: 0,
        available: assigned,
        needed: Math.max(target - assigned, 0),
        detail: `${formatCurrency(Math.max(target - assigned, 0))} more needed by the ${bill.due_day}${getDaySuffix(Number(bill.due_day))}`,
        sortOrder: Number(bill.due_day || 99),
      };
    })
    .filter((item) => item.target > 0);

  const categoryBudgetItems = categories
    .map((category) => {
      const key = `category:${category.id}`;
      const target = Number(category.monthly_limit || 0);
      const assigned = Number(assignedBudget[key] || 0);
      const matchedCategoryRow = categoryRows.find((row) => row.id === category.id);
      const activity = Number(matchedCategoryRow?.monthlySpent || 0);

      return {
        key,
        group: category.group_name || "Flexible",
        name: category.name,
        target,
        assigned,
        activity,
        available: assigned - activity,
        needed: Math.max(target - assigned, 0),
        detail: `${formatCurrency(Math.max(target - assigned, 0))} more needed this month`,
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
  const nextPayday = getNextPayday(paycheckSettings, now);
  const daysUntilNextPayday = nextPayday ? diffInDays(now, nextPayday) : null;
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
  const assignedGoalReserve = categoryBudgetItems
    .filter((item) => item.group === "Savings")
    .reduce((sum, item) => sum + Math.max(item.assigned, 0), 0);
  const upcomingBillsBeforePayday = billBudgetItems.filter((bill) => {
    if (!nextPayday) return false;
    const matchedBill = bills.find((item) => `bill:${item.id}` === bill.key);
    if (!matchedBill || matchedBill.is_paid) return false;
    if (!(matchedBill.counts_toward_available_cash ?? true)) {
      return false;
    }
    const dueDate = getNextDueDate(Number(matchedBill.due_day || 1), now);
    return dueDate <= nextPayday;
  });
  const upcomingBillsBeforePaydayTotal = upcomingBillsBeforePayday.reduce(
    (sum, bill) => sum + bill.target,
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
  const dailySafeToSpend = Math.min(
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
    dailySafeToSpend * daysRemainingThisWeek,
    weeklyFundedSpendAllowance,
    weeklyBudgetCapRemaining,
    cashAvailableUntilPayday
  );
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.10),_transparent_24%),linear-gradient(180deg,_#08101f_0%,_#0b1324_46%,_#09101d_100%)] px-4 py-4 text-white sm:px-6 lg:px-8 lg:py-8">
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

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:items-end">
            <div>
              <h1 className="text-5xl font-bold text-cyan-300 drop-shadow-[0_0_16px_rgba(34,211,238,0.45)] sm:text-6xl">
            ${safeToSpend.toFixed(2)}
              </h1>

              <p className={safeToSpend <= 0 ? "mt-2 text-red-400" : "mt-2 text-emerald-400"}>
                {safeToSpendStatus}
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
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Friday After This</p>
                <p className="mt-3 text-3xl text-slate-50">{formatCurrency(fridayNumberAfterPlanned)}</p>
              </div>

              <div className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Underfunded</p>
                <p className="mt-3 text-3xl text-slate-50">{formatCurrency(underfundedTotal)}</p>
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

        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-12">
        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-5">
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-7">
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
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Bills before payday</p>
                <p className="mt-2 text-lg text-slate-50">{formatCurrency(upcomingBillsBeforePaydayTotal)}</p>
                <p className="text-xs text-gray-500">
                  {upcomingBillsBeforePayday.length} upcoming bill{upcomingBillsBeforePayday.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-7">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Assign Every Dollar</p>
            <p className="text-xs text-gray-500">{formatMonthYear(now)}</p>
          </div>

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
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p>{item.name}</p>
                          <p className="text-xs text-gray-400">{item.detail}</p>
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
                            width: `${Math.min((item.assigned / item.target) * 100, 100)}%`,
                          }}
                        />
                      </div>

                      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                        <input
                          value={String(item.target)}
                          onChange={(e) => updateBudgetItemTarget(item.key, e.target.value)}
                          type="number"
                          className="rounded-lg border border-gray-700 bg-black p-2"
                        />
                        <input
                          value={String(item.assigned)}
                          onChange={(e) => updateAssignedBudget(item.key, e.target.value)}
                          type="number"
                          className="rounded-lg border border-gray-700 bg-black p-2"
                        />
                        <button
                          onClick={() => void saveBudgetItemTarget(item.key)}
                          className="rounded-lg border border-slate-600 px-3 py-2 text-slate-300"
                        >
                          Save Target
                        </button>
                        <button
                          onClick={() => fundItem(item.key, Math.min(item.needed, Math.max(readyToAssign, 0)))}
                          className="rounded-lg border border-cyan-400 px-3 py-2 text-cyan-300"
                        >
                          Fund
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4 space-y-3">
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4 space-y-3">
          <p className="text-sm text-gray-400">Quick Add Transaction</p>

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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4 space-y-3">
          <p className="text-sm text-gray-400">Add Spending Category</p>

          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

          <input
            value={newCategoryGroup}
            onChange={(e) => setNewCategoryGroup(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-xl bg-black border border-gray-700 p-3"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              value={newCategoryWeeklyLimit}
              onChange={(e) => setNewCategoryWeeklyLimit(e.target.value)}
              placeholder="Weekly limit"
              type="number"
              className="w-full rounded-xl bg-black border border-gray-700 p-3"
            />

            <input
              value={newCategoryMonthlyLimit}
              onChange={(e) => setNewCategoryMonthlyLimit(e.target.value)}
              placeholder="Monthly limit"
              type="number"
              className="w-full rounded-xl bg-black border border-gray-700 p-3"
            />
          </div>

          <button
            onClick={addCategory}
            className="w-full rounded-xl border border-cyan-400 py-2 text-cyan-300"
          >
            Save Category
          </button>
        </section>

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-6">
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-6">
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4">
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4">
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

        <section className="rounded-[1.75rem] border border-red-400/25 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-4">
          <p className="text-sm text-gray-400">Overspending Defense</p>

          <div className="mt-3 space-y-2">
            {overspendingDefense.map((cat) => (
              <div key={cat.id} className="flex justify-between text-sm">
                <span>{cat.name}</span>
                <span
                  className={
                    cat.weeklyRemaining < 0 ? "text-red-400" : "text-cyan-300"
                  }
                >
                  ${cat.weeklyRemaining.toFixed(2)} left
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3">
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3">
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

          <button
            onClick={() => updateSavings(Number(savings?.current || 0) + 25)}
            className="mt-3 w-full rounded-xl border border-green-400 py-2 text-green-300"
          >
            Add $25
          </button>
        </section>

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] lg:col-span-2 2xl:col-span-6">
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

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3">
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
              No snapshot yet. We can add a snapshot form next.
            </p>
          )}
        </section>

        <section className="rounded-[1.75rem] border border-slate-700/80 bg-[#111827]/92 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)] 2xl:col-span-3">
          <p className="text-sm text-gray-400 mb-2">Recent Transactions</p>
          {transactions.slice(0, 8).map((tx) => (
            <div key={tx.id} className="flex justify-between py-1 text-sm">
              <span>{tx.category}</span>
              <span>-${Number(tx.amount).toFixed(2)}</span>
            </div>
          ))}
        </section>
        </div>
      </div>
    </main>
  );
}
