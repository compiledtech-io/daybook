# Daybook

Daybook is an offline personal expense tracker. It records income (credits) and expenses (debits) with an amount, local date and time, source or payee, optional category, and notes. It also tracks accounts, budgets, recurring transactions, and money owed. Transactions and settings live in the same portable CSV.

## Getting started

1. Extract the entire ZIP. On Windows, double-click **Start Daybook.cmd**, or open **Daybook.html** in Microsoft Edge or Google Chrome. On Linux or macOS, open **Daybook.html** in a browser.
2. Select **New CSV** to create a ledger, or **Open CSV** to load an existing one.
3. Select **Add transaction**. The form starts at the device's current date and time, and you can change both for earlier transactions.
4. Select **Save** after making changes. When the browser grants direct file access, Save updates the chosen CSV. Otherwise it downloads the complete updated ledger. After checking that the browser saved it, select **Confirm downloaded CSV**. Keep that copy and replace the older copy yourself if desired.
5. To move between devices, first save, then copy the CSV and open it in Daybook on the other device. **Save as** creates a separate copy. Daybook opens one ledger at a time.

The CSV is the saved record. Changes made since the last successful save or download are held in the open window. An orange status indicator identifies unsaved changes. Keep a separate backup copy before moving or editing the ledger elsewhere. Close or reload a ledger after editing it in another app. Direct saving checks for external changes before overwriting.

## Views

| View | What to do |
| --- | --- |
| Transactions | Search payees, income sources, notes, categories, or account names. Combine type, month, category, account, date range, and amount filters. Sort by date or amount. An account filter matches both sides of a transfer. |
| Reports | Pick a month to see spending by category, or compare income, expenses, and net income across recorded months. |
| Budgets | Set one repeating monthly limit per category. Pick a month to see how much you spent and how much is left or over. Budget matching ignores capitalization and surrounding spaces. |
| Accounts | Create cash, bank, or wallet accounts. Set an opening balance and choose an account for each entry. Choose **Transfer** in the transaction form to move money between accounts. Existing entries start in General. |
| Recurring | Set up weekly or monthly bills and income. Select **Post** when an occurrence is due and confirm it. Posting advances the schedule by one occurrence. Monthly schedules use the last day in shorter months and resume the original day when possible. |
| Money owed | Record money lent or borrowed and select the account that received or paid it. Record partial or full repayments and see how much is still outstanding. |
| Backups | Download a timestamped snapshot of the open ledger, including unsaved changes. **Restore from CSV** opens a working copy for you to save under a new filename. |

Transaction totals and reports count income and expenses. Account balances also include opening balances, transfers, money lent or borrowed, and repayments. Recurring transactions only affect balances after you post them. For an incorrect debt repayment, remove its transaction and record the corrected amount from **Money owed**.

## CSV files

Daybook saves UTF-8, comma-delimited CSV with this header.

```csv
ID,Date,Time,Type,Amount,Counterparty,Category,Notes,Account,Transfer To,Debt ID,Settings
```

- The final `settings` row stores the account list, budgets, schedules, and debt details. Keep that row and the column order when copying the file. Edit these features in Daybook so it can keep their transaction references valid.
- Older Daybook CSVs open in the updated app. Saving writes the upgraded format. Use **Save as** if you want to keep a copy readable by the original version.
- Dates and times are recorded as local wall-clock values. Dates use YYYY-MM-DD and times use HH:MM:SS. Moving the file preserves the entered date and time. Date-only imports retain a blank time.
- Transaction types are `credit`, `debit`, `transfer`, `lend`, `borrow`, `collect`, and `repay`. Transaction amounts are positive decimal numbers with up to two decimal places. Use one currency per ledger.
- IDs identify transactions across edits. Text fields can contain commas, quotes, or line breaks. Daybook protects formula-like text in its CSV exports with a reversible leading apostrophe.
- You can also open a compatible legacy CSV. Use a header row with `Date`, `Description` (or `Counterparty`), and either `Debit` and `Credit` columns or `Type` and `Amount` columns. Optional columns are `Time`, `Category`, and `Notes`. For separate debit and credit columns, exactly one amount must be positive per row. Keep amounts free of currency symbols and thousands separators, and use ISO dates. Save As converts a legacy file to Daybook's format. Columns outside the supported set stay in the original file only.
- Daybook validates the entire file before opening it and reports the row if a field is invalid. For a bank or spreadsheet export with different columns, rearrange a copy to match the legacy format before opening it.

## Platform scope

| Platform | How to run |
| --- | --- |
| Windows | Windows launcher or open the HTML in Edge or Chrome |
| Linux and macOS | Open the HTML in a desktop browser. Choose Chrome if you want direct CSV saving and the browser exposes it. |
| Android and iPhone/iPad | Future packaging targets. The layout adapts to small screens, and portable CSV import/export can be reused in a mobile release. |

This release is a self-contained HTML app. It uses the installed browser to display the interface and requires no server, account, package install, or internet connection. It includes no native installer. Some browser or system policies may restrict access to local files. The app offers file upload and download as a fallback.

For Android and iOS, a future native package can reuse this interface and CSV parser. It would connect **Open CSV** and **Save as** to each platform’s document picker and be tested on actual devices before release. The same CSV format can travel between desktop and mobile.

## Project structure

- `src/index.html` contains the interface.
- `src/styles.css` contains the visual design and responsive layout.
- `src/ledger.js` implements CSV validation and serialization.
- `src/app.js` manages transactions, filters, and browser file operations.
- `src/features.js` implements the additional views and their workflows.
- `build.py` bundles the source into `Daybook.html`; run it with Python 3 only when changing the source.
