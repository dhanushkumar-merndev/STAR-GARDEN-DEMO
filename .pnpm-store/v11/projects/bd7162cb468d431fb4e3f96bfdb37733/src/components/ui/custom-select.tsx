'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { LuCheck, LuChevronDown } from 'react-icons/lu';
import { cn } from '@/lib/utils/cn';

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};

export type CustomSelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'defaultValue' | 'multiple' | 'onChange' | 'size' | 'value'
> & {
  children: React.ReactNode;
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
};

/**
 * A form-compatible Radix select that accepts normal `<option>` children.
 * Keeping the native-looking API means every existing CRM form gets the same
 * accessible custom menu without rewriting its validation or FormData flow.
 */
export function CustomSelect({
  children,
  className,
  defaultValue,
  disabled,
  id,
  name,
  onChange,
  required,
  value,
  ...props
}: CustomSelectProps) {
  const options = React.useMemo(() => readOptions(children), [children]);
  const placeholder = options.find((option) => option.value === '')?.label ?? 'Select an option';
  const firstSelectable = options.find((option) => option.value !== '' && !option.disabled)?.value ?? '';
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(() => defaultValue ?? firstSelectable);
  const selectedValue = controlled ? value ?? '' : internalValue;

  function handleValueChange(nextValue: string) {
    if (!controlled) setInternalValue(nextValue);
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as React.ChangeEvent<HTMLSelectElement>);
  }

  return (
    <SelectPrimitive.Root
      name={name}
      value={selectedValue || undefined}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={props['aria-invalid']}
        aria-describedby={props['aria-describedby']}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-ink transition-colors',
          'focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none',
          'data-[placeholder]:text-ink-subtle disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <LuChevronDown className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          <SelectPrimitive.Viewport className="max-h-72 overflow-y-auto">
            {options
              .filter((option) => option.value !== '')
              .map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="relative flex min-h-10 cursor-pointer select-none items-center rounded-md py-2 pr-8 pl-3 text-sm text-ink outline-none data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center text-brand-700">
                    <LuCheck className="size-4" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function readOptions(children: React.ReactNode): SelectOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== 'option') return [];
    const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode };
    const label = optionText(props.children).trim();
    return [{ value: props.value === undefined ? label : String(props.value), label, disabled: Boolean(props.disabled) }];
  });
}

function optionText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return React.isValidElement(child)
        ? optionText((child.props as { children?: React.ReactNode }).children)
        : '';
    })
    .join('');
}
