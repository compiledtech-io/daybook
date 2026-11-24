# Daybook

Daybook is a free, offline personal finance tracker. Record income, expenses, transfers, lending, and repayments. Review your monthly spending and budgets, and keep every transaction and ledger setting in a single CSV you can move between computers.

## Run Daybook

1. On GitHub, choose **Code → Download ZIP** and extract it. If you cloned the repository, open your local checkout.
2. On Windows, double-click [Start Daybook.cmd](Start%20Daybook.cmd), or open `Daybook.html` in Microsoft Edge or Google Chrome. On Linux or macOS, open `Daybook.html` in a desktop browser.
3. Choose **New CSV** to start a ledger, or **Open CSV** to load an existing one.
4. Choose **Add transaction** and enter an expense, income, or transfer. New entries start with your device’s current date and time. Change these values to record an earlier transaction.
5. Click **Save**. With direct file access, Daybook updates the selected CSV. Otherwise, the browser downloads the full ledger. Check that the download completed, then click **Confirm downloaded CSV**.

Daybook runs in your browser with no server, account, or internet connection required. An orange status indicator marks unsaved changes. Use **Save as** to keep a separate copy, and copy the CSV to another device to continue there.

## What you can do

| View | Features |
| --- | --- |
| **Transactions** | Add, edit, or remove ordinary transactions. Search by payee, income source, category, notes, or account. Filter by type or month, or use **More filters** to combine account, category, date range, and amount. Sort by date or amount. |
| **Reports** | Compare income, expenses, and net income across recorded months. Select a month to see its spending by category. |
| **Budgets** | Set a monthly limit per category and select a month to see the amount spent and how much remains or exceeds the limit. Budget matching ignores capitalization and surrounding spaces. |
| **Accounts** | Track cash, bank, and wallet balances. Set opening balances and record transfers between accounts. Imported transactions from older ledgers start in General. |
| **Recurring** | Schedule weekly or monthly bills and income. Confirm each due entry with **Post**. Monthly schedules use the last day in shorter months and resume their original day when possible. |
| **Money owed** | Track money lent or borrowed, record partial or full repayments, and see the outstanding amount. |
| **Backups** | Download a timestamped CSV snapshot that includes unsaved changes. Restore a backup as a separate working copy and save it under a new filename. |

### Try the new features

- **Track a transfer.** Create a second account under **Accounts**. In **Add transaction**, choose **Transfer** and select the source and destination. Account balances change, while the income and expense totals stay the same. Filtering by either account shows the transfer.
- **Check a budget.** Record an expense with a category, then add a limit for that category under **Budgets**. Select the expense’s month to see its effect.
- **Record a partial repayment.** In **Money owed**, record money lent or borrowed, then choose **Record repayment** and enter an amount smaller than the outstanding balance. To correct a repayment, remove its transaction and enter the corrected amount from **Money owed**.
- **Test a restore.** In **Backups**, download a dated backup, then reopen it using **Restore from CSV**. Save the restored copy under a different filename.

Account balances include opening balances, transfers, lending, borrowing, and repayments. Reports measure income and expenses. Recurring transactions affect balances once you post them.

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

The repository includes a self-contained HTML app. It uses the installed browser to display the interface and requires no server, account, package install, or internet connection. It includes no native installer. Some browser or system policies may restrict access to local files. The app offers file upload and download as a fallback.

For Android and iOS, a future native package can reuse this interface and CSV parser. It would connect **Open CSV** and **Save as** to each platform’s document picker and be tested on actual devices before release. The same CSV format can travel between desktop and mobile.

## Build from source

Open a terminal in the repository folder and run:

```bash
python3 build.py
```

On Windows with the Python launcher, use `py build.py`. The script rebuilds `Daybook.html` using the Python standard library. Open that file to run the updated app.

## Project structure

- `src/index.html` contains the interface.
- `src/styles.css` contains the visual design and responsive layout.
- `src/ledger.js` implements CSV validation and serialization.
- `src/app.js` manages transactions, filters, and browser file operations.
- `src/features.js` implements the additional views and their workflows.
- `build.py` bundles the source into `Daybook.html`; run it with Python 3 only when changing the source.

## License

Daybook is released under the [MIT License](LICENSE).
