import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type Category,
  defaultCategoryForType,
  normalizeCategory,
} from "@/lib/categories";

type Props = {
  value: string;
  onChange: (value: Category) => void;
  entryType?: "income" | "expense" | "all";
  placeholder?: string;
  id?: string;
};

export function CategorySelect({
  value,
  onChange,
  entryType = "all",
  placeholder = "Velg kategori",
  id,
}: Props) {
  const options =
    entryType === "income"
      ? INCOME_CATEGORIES
      : entryType === "expense"
        ? EXPENSE_CATEGORIES
        : CATEGORIES;

  const normalized = normalizeCategory(value);
  const selected =
    normalized && (options as readonly string[]).includes(normalized)
      ? normalized
      : value && (options as readonly string[]).includes(value)
        ? value
        : "";

  return (
    <Select
      value={selected || undefined}
      onValueChange={(v) => onChange(v as Category)}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function categoryOrDefault(
  value: string | null | undefined,
  entryType: "income" | "expense",
): Category {
  return normalizeCategory(value) ?? defaultCategoryForType(entryType);
}
