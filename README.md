# EcoTrack: A School Sustainability Data Platform

## Project purpose
EcoTrack is a prototype sustainability dashboard for a school. It allows students, teachers and sustainability coordinators to record electricity, water and waste data, compare measurements over time, and review resource-use patterns.

## Intended users
- Secondary school students
- Teachers
- Sustainability coordinators
- School administrators reviewing data quality and trends

## Technology stack
- HTML5
- CSS3
- Vanilla JavaScript
- Chart.js via CDN
- Browser localStorage

## File structure
- index.html — main page layout and sections
- style.css — styling, dark dashboard theme and responsive layout
- script.js — data handling, validation, dashboard logic, charts and CSV support
- README.md — project instructions and notes

## Setup and running instructions
1. Open the project folder in VS Code.
2. Start a simple local web server from the project folder. For example:
   `python -m http.server 8000`
3. Open http://localhost:8000 in a browser.
4. The dashboard should load without any build tools or package installation.

## Main features
- Dashboard summary cards
- Reporting period filter
- Data entry form for electricity, water and waste
- Record management for editing and deleting measurements
- Analytics charts using Chart.js
- Goal tracking and recommendations
- CSV import and export
- Demo dataset for testing and demonstration

## Data structure and field definitions
Each record includes:
- `id` — unique record ID
- `date` — measurement date in YYYY-MM-DD format
- `resourceType` — Electricity, Water, Waste generated, or Waste diverted
- `value` — numeric measurement value
- `unit` — matching unit for the resource type
- `location` — optional area or building name
- `source` — data source such as a utility report or meter reading
- `notes` — optional extra context

The prototype uses consistent units per resource type:
- Electricity: kWh
- Water: L or kL
- Waste generated: kg
- Waste diverted: kg

## How localStorage works in this prototype
The website saves records and goals in the browser using localStorage. This means the data remains after refreshing the page in the same browser, but it is not shared across devices or users.

Important points:
- localStorage is browser-specific
- it does not replace a school database
- it is not secured against unauthorised access in the same way as a server-based system
- it should not be used for confidential student or personal information

## How to import a CSV file
1. Open the Sustainability Data page.
2. Click Import CSV.
3. Choose a CSV file with the columns:
   `date,resourceType,value,unit,location,source,notes`
4. The script checks headers and validates each row.
5. Valid records are added to the current dataset.
6. Invalid rows are reported with reasons.

## How to export data
1. Open the Sustainability Data page.
2. Click Export CSV.
3. A CSV file named `ecotrack-sustainability-data.csv` is downloaded.
4. The file includes the record headers and current dataset values.

## How the charts and calculations work
The website calculates totals from the current dataset and filters records by the selected reporting period. Each chart uses actual in-memory values instead of fixed numbers. The dashboard and analytics pages update after a record is added, edited or deleted.

The main processing flow is:
1. User enters or imports sustainability data.
2. The application validates the information.
3. Valid records are saved in localStorage.
4. JavaScript filters and processes the records.
5. Totals and comparisons are calculated.
6. Chart.js displays the updated datasets.
7. The dashboard refreshes when records change.

## How the benchmarks are used
EcoTrack includes Victorian Department of Education benchmark references for electricity, mains water and waste-to-landfill. These are reference figures, not guaranteed averages for every school.

The prototype does not present total school usage as a direct benchmark comparison without matching dates, student enrolment and compatible units. Benchmark comparisons are only descriptive and educational, not a proof that a school is above or below a standard.

## Known limitations
- The site does not connect to school utility meters automatically.
- Data quality depends on the information supplied by the user.
- localStorage is not a multi-user database.
- Benchmarks are educational reference points, not exact school averages.
- The prototype cannot prove the cause of resource-use changes.
- It does not provide automatic AI predictions or advanced forecasting.

## Security and privacy considerations
- No student names, passwords or personal credentials are collected.
- No fake login system is created.
- Imported CSV data is treated as untrusted user input and validated.
- Destructive actions such as clearing the dataset require confirmation.
- A production school system would need secure authentication, role-based access control, server-side storage, backups and HTTPS.

## Testing instructions
Open the website in a browser and test the following:
1. Dashboard loads with summary cards and demo data.
2. Navigation switches to each page.
3. A new electricity, water and waste record can be added.
4. Missing fields and invalid values are rejected.
5. A record can be edited and deleted.
6. Data persists after refresh.
7. Date and resource filters work.
8. Chart content updates when data changes.
9. CSV import and export work with a valid sample file.
10. Goal tracking saves and displays correctly.

## External libraries and their sources
- Chart.js: https://www.jsdelivr.com/package/npm/chart.js

## References and acknowledgements
- Department of Education, Victoria. (2026, January 9). Benchmarks for utility usage. Policy and Advisory Library.
- United Nations. Goal 12: Ensure sustainable consumption and production patterns.
- United Nations. Goal 13: Take urgent action to combat climate change and its impacts.

This project was created as a local prototype for a Year 11 Applied Computing assessment. It prioritises functionality, clear data handling, and understandable JavaScript over advanced production architecture.
