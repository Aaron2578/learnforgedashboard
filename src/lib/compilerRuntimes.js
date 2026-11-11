// Compiler runtimes, sandbox builders, and educational templates for LearnForge IT Code Lab
import { transform as sucraseTransform } from "sucrase";

export const SAMPLE_SALES_CSV = `order_id,date,region,category,product,units,unit_price,revenue,customer_tier
1001,2026-01-05,South,Cloud,AWS Training Lab,4,149,596,Enterprise
1002,2026-01-08,North,Programming,Full Stack Java Kit,6,199,1194,Student
1003,2026-01-14,West,Analytics,Python Data Kit,8,129,1032,Pro
1004,2026-01-21,East,Database,SQL Mastery Pack,10,99,990,Student
1005,2026-02-02,South,Analytics,Power BI Workbook,5,149,745,Enterprise
1006,2026-02-11,North,Programming,MERN React Bundle,7,179,1253,Pro
1007,2026-02-19,West,Testing,QA Automation Suite,3,159,477,Enterprise
1008,2026-03-03,East,Cloud,Docker & DevOps Pack,5,189,945,Pro
1009,2026-03-10,South,Programming,Python Full Stack,9,169,1521,Student
1010,2026-03-18,West,Analytics,Tableau Dashboard Lab,4,139,556,Enterprise
1011,2026-03-24,North,Database,PostgreSQL Tuning,6,119,714,Pro
1012,2026-04-02,East,Programming,C++ DSA Mastery,8,109,872,Student`;

export const SQL_SEED_SCRIPT = `
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  budget INTEGER NOT NULL
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  department_id INTEGER NOT NULL,
  salary INTEGER NOT NULL,
  hire_date TEXT NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  segment TEXT NOT NULL
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO departments VALUES
  (1, 'Software Engineering', 'Bengaluru', 450000),
  (2, 'Data & Analytics', 'Hyderabad', 320000),
  (3, 'Quality Assurance', 'Chennai', 210000),
  (4, 'Cloud Infrastructure', 'Pune', 290000);

INSERT INTO employees VALUES
  (101, 'Aarav Nair', 'Senior Java Developer', 1, 95000, '2023-03-15'),
  (102, 'Priya Sharma', 'Python Full Stack Lead', 1, 108000, '2022-07-01'),
  (103, 'Kiran Rao', 'Data Analyst', 2, 78000, '2024-01-10'),
  (104, 'Sneha Verma', 'BI Visualization Specialist', 2, 86000, '2023-09-20'),
  (105, 'Rohan Das', 'QA Automation Engineer', 3, 72000, '2024-04-12'),
  (106, 'Meera Iyer', 'MERN Stack Developer', 1, 89000, '2023-11-05'),
  (107, 'Vikram Singh', 'Cloud SRE', 4, 102000, '2022-10-18');

INSERT INTO customers VALUES
  (1, 'Vertex Systems', 'Bengaluru', 'Enterprise'),
  (2, 'Nova Retail', 'Mumbai', 'Mid-Market'),
  (3, 'Apex FinTech', 'Hyderabad', 'Enterprise'),
  (4, 'BrightPath Edu', 'Chennai', 'SMB');

INSERT INTO products VALUES
  (1, 'PRD-101', 'Cloud Analytics Suite', 'Analytics', 499.00),
  (2, 'PRD-102', 'Java Microservices License', 'Backend', 349.00),
  (3, 'PRD-103', 'React UI Pro Kit', 'Frontend', 199.00),
  (4, 'PRD-104', 'SQL Performance Monitor', 'Database', 279.00);

INSERT INTO orders VALUES
  (5001, 1, 1, 3, '2026-01-15', 'Completed'),
  (5002, 2, 3, 5, '2026-01-22', 'Completed'),
  (5003, 3, 2, 4, '2026-02-05', 'Completed'),
  (5004, 1, 4, 2, '2026-02-18', 'Pending'),
  (5005, 4, 3, 4, '2026-03-01', 'Completed'),
  (5006, 3, 1, 2, '2026-03-12', 'Completed');
`;

export const LAB_MODES = [
  {
    id: "python",
    label: "Python 3",
    group: "Core Languages",
    editorLang: "python",
    fileExt: "main.py",
    supportsStdin: true,
    runtimeBadge: "Python 3.12 (Browser WASM)",
    description: "Run Python 3 programs, algorithms, OOP, file loops, and stdin scripts directly in the browser.",
    templates: [
      {
        name: "Algorithms & Comprehensions",
        stdin: "",
        code: `# Python 3 Starter: Student Grade Analyzer
scores = [88, 94, 72, 91, 85, 67, 96]

def classify(score):
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    return "Needs Review"

report = [(s, classify(s)) for s in scores]
avg = sum(scores) / len(scores)

print(f"Class Average: {avg:.2f}")
print("Score Breakdown:")
for score, grade in report:
    print(f"  Score {score} -> Grade {grade}")
`,
      },
      {
        name: "Interactive Input (stdin)",
        stdin: "Aarav\n85\n92\n88",
        code: `# Uses the Stdin Input panel on the right
name = input("Student Name: ")
marks = [int(input()) for _ in range(3)]
average = sum(marks) / len(marks)
print(f"\\nHello, {name}!")
print(f"Marks: {marks}")
print(f"Average: {average:.2f}%")
`,
      },
      {
        name: "OOP Class & Inheritance",
        stdin: "",
        code: `class Course:
    def __init__(self, code, title, hours):
        self.code = code
        self.title = title
        self.hours = hours

    def summary(self):
        return f"[{self.code}] {self.title} ({self.hours} hrs)"

class LabCourse(Course):
    def __init__(self, code, title, hours, stack):
        super().__init__(code, title, hours)
        self.stack = stack

    def summary(self):
        return f"{super().summary()} | Stack: {', '.join(self.stack)}"

c = LabCourse("TMIT-201", "Full Stack Python", 120, ["Python", "Django", "SQL", "React"])
print(c.summary())
`,
      },
    ],
  },
  {
    id: "java",
    label: "Java",
    group: "Core Languages",
    editorLang: "java",
    fileExt: "Main.java",
    supportsStdin: true,
    runtimeBadge: "OpenJDK 25 javac + TeaVM WASM",
    description: "Compile and run standard Java classes (use `public class Main`), OOP, Collections, and Scanner stdin.",
    templates: [
      {
        name: "Main & Streams Demo",
        stdin: "",
        code: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> marks = Arrays.asList(78, 92, 85, 96, 81);
        Collections.sort(marks, Collections.reverseOrder());

        int total = 0;
        for (int m : marks) {
            total += m;
        }
        double average = (double) total / marks.size();

        System.out.println("Sorted Marks (Desc): " + marks);
        System.out.printf("Class Average: %.2f%n", average);
    }
}
`,
      },
      {
        name: "Scanner Input (stdin)",
        stdin: "Priya\n5",
        code: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String name = sc.hasNextLine() ? sc.nextLine() : "Learner";
        int n = sc.hasNextInt() ? sc.nextInt() : 5;

        System.out.println("Student: " + name);
        long fact = 1;
        for (int i = 1; i <= n; i++) {
            fact *= i;
        }
        System.out.println("Factorial of " + n + " = " + fact);
    }
}
`,
      },
      {
        name: "OOP Polymorphism",
        stdin: "",
        code: `abstract class Developer {
    protected String name;
    Developer(String name) { this.name = name; }
    abstract String stack();
    void introduce() {
        System.out.println(name + " builds with " + stack());
    }
}

class JavaFullStackDev extends Developer {
    JavaFullStackDev(String name) { super(name); }
    @Override String stack() { return "Java, Spring Concepts, SQL & React"; }
}

public class Main {
    public static void main(String[] args) {
        Developer dev = new JavaFullStackDev("Kiran");
        dev.introduce();
    }
}
`,
      },
    ],
  },
  {
    id: "c",
    label: "C",
    group: "Core Languages",
    editorLang: "cpp",
    fileExt: "main.c",
    supportsStdin: true,
    runtimeBadge: "C Standard Interpreter (Browser)",
    description: "Practice C syntax, printf/scanf, arrays, structs, pointers, and recursion with 5s loop protection.",
    templates: [
      {
        name: "Array Reverse & Functions",
        stdin: "",
        code: `#include <stdio.h>

void reverse(int arr[], int n) {
    int left = 0;
    int right = n - 1;
    while (left < right) {
        int temp = arr[left];
        arr[left] = arr[right];
        arr[right] = temp;
        left++;
        right--;
    }
}

int main() {
    int nums[] = {10, 20, 30, 40, 50};
    int n = 5;
    reverse(nums, n);

    printf("Reversed array: ");
    for (int i = 0; i < n; i++) {
        printf("%d ", nums[i]);
    }
    printf("\\n");
    return 0;
}
`,
      },
      {
        name: "scanf Stdin Sum",
        stdin: "12 30",
        code: `#include <stdio.h>

int main() {
    int a = 0, b = 0;
    scanf("%d %d", &a, &b);
    printf("Input: %d and %d\\n", a, b);
    printf("Sum = %d\\n", a + b);
    printf("Product = %d\\n", a * b);
    return 0;
}
`,
      },
    ],
  },
  {
    id: "cpp",
    label: "C++",
    group: "Core Languages",
    editorLang: "cpp",
    fileExt: "main.cpp",
    supportsStdin: true,
    runtimeBadge: "C++ Interpreter (Browser)",
    description: "Run C++ iostream, loops, arrays, pointers, functions, classes, and recursive algorithms in-browser.",
    templates: [
      {
        name: "Fibonacci & Loops",
        stdin: "8",
        code: `#include <iostream>
using namespace std;

int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int count;
    cin >> count;
    cout << "First " << count << " Fibonacci numbers:" << endl;
    for (int i = 0; i < count; i++) {
        cout << fib(i) << (i + 1 < count ? ", " : "");
    }
    cout << endl;
    return 0;
}
`,
      },
      {
        name: "Binary Search",
        stdin: "",
        code: `#include <iostream>
using namespace std;

int binarySearch(int arr[], int n, int target) {
    int low = 0, high = n - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}

int main() {
    int data[] = {4, 11, 19, 25, 34, 48, 63};
    int idx = binarySearch(data, 7, 34);
    cout << "Target 34 found at index: " << idx << endl;
    return 0;
}
`,
      },
    ],
  },
  {
    id: "sql",
    label: "SQL Studio",
    group: "Data & BI",
    editorLang: "sql",
    fileExt: "query.sql",
    supportsStdin: false,
    runtimeBadge: "SQLite 3 WASM (Local Training DB)",
    description: "Write SELECT, JOIN, GROUP BY, Window Functions, CTEs & DDL against the pre-loaded company & sales schema.",
    templates: [
      {
        name: "Department Salary Analytics (JOIN + GROUP BY)",
        stdin: "",
        code: `-- Relational Join & Department Payroll Summary
SELECT
  d.name AS department,
  d.location,
  COUNT(e.id) AS headcount,
  ROUND(AVG(e.salary), 0) AS avg_salary,
  MAX(e.salary) AS top_salary
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name, d.location
ORDER BY avg_salary DESC;
`,
      },
      {
        name: "Revenue by Customer & Product",
        stdin: "",
        code: `-- Multi-table Customer Order Revenue Analysis
SELECT
  c.name AS customer,
  c.segment,
  p.category,
  SUM(o.quantity) AS units_bought,
  ROUND(SUM(o.quantity * p.price), 2) AS total_spend
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id
WHERE o.status = 'Completed'
GROUP BY c.id, p.category
ORDER BY total_spend DESC;
`,
      },
      {
        name: "Window Function Ranking",
        stdin: "",
        code: `-- Rank Employees Within Each Department
SELECT
  e.full_name,
  d.name AS department,
  e.salary,
  RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS dept_rank
FROM employees e
JOIN departments d ON d.id = e.department_id;
`,
      },
    ],
  },
  {
    id: "data-analytics",
    label: "Data Analytics",
    group: "Data & BI",
    editorLang: "python",
    fileExt: "analysis.py",
    supportsStdin: false,
    runtimeBadge: "Python + Pandas + NumPy + Matplotlib",
    description: "Analyze CSV datasets (built-in or upload your own `data.csv`) with Pandas and plot Matplotlib charts inline.",
    templates: [
      {
        name: "Pandas Summary & Revenue Bar Chart",
        stdin: "",
        code: `import pandas as pd
import matplotlib.pyplot as plt

# data.csv is loaded automatically (or upload your own CSV!)
df = pd.read_csv("data.csv")
print("=== Dataset Preview ===")
print(df.head(5).to_string(index=False))

summary = df.groupby("category")[["units", "revenue"]].sum().sort_values("revenue", ascending=False)
print("\\n=== Revenue by Category ===")
print(summary)

# Generate visual chart inline
fig, ax = plt.subplots(figsize=(7, 3.8))
colors = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b"]
summary["revenue"].plot(kind="bar", ax=ax, color=colors[:len(summary)])
ax.set_title("Total Revenue by Product Category ($)", fontsize=12, fontweight="bold")
ax.set_ylabel("Revenue ($)")
ax.set_xlabel("")
plt.xticks(rotation=15)
plt.grid(axis="y", linestyle="--", alpha=0.4)
plt.tight_layout()
plt.show()
`,
      },
      {
        name: "Regional Trend & Pie Breakdown",
        stdin: "",
        code: `import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

df = pd.read_csv("data.csv")
regional = df.groupby("region")["revenue"].agg(["count", "sum", "mean"]).round(2)
print("=== Regional Performance ===")
print(regional)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(8.5, 3.6))
regional["sum"].plot(kind="pie", autopct="%1.1f%%", ax=ax1, startangle=90)
ax1.set_title("Revenue Share by Region")
ax1.set_ylabel("")

df.groupby("date")["revenue"].sum().plot(kind="line", marker="o", ax=ax2, color="#4f46e5")
ax2.set_title("Order Revenue Over Time")
ax2.tick_params(axis="x", rotation=30)
plt.tight_layout()
plt.show()
`,
      },
    ],
  },
  {
    id: "bi-studio",
    label: "BI & Charts Studio",
    group: "Data & BI",
    editorLang: "json",
    fileExt: "dashboard",
    supportsStdin: false,
    runtimeBadge: "Power BI / Tableau Practice Companion",
    description: "Upload CSVs to build interactive KPI cards & charts in-dashboard, or preview Power BI / Tableau Public embeds.",
    templates: [],
  },
  {
    id: "web",
    label: "HTML / CSS / JS",
    group: "Web & MERN",
    editorLang: "html",
    fileExt: "index.html",
    supportsStdin: false,
    runtimeBadge: "Live Sandboxed Browser Preview",
    description: "Edit HTML, CSS, and JavaScript side by side with an instant visual preview and isolated console output.",
    templates: [
      {
        name: "Interactive Pricing / Course Card",
        html: `<div class="card">
  <span class="pill">IT Full Stack Track</span>
  <h2>LearnForge Interactive Web Lab</h2>
  <p>Edit HTML, CSS, or JavaScript and click <strong>Run</strong> to update live.</p>
  <button id="enrollBtn">Clicks: <span id="count">0</span></button>
</div>`,
        css: `body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f8fafc;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 90vh;
  margin: 0;
}
.card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 24px;
  max-width: 360px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
}
.pill {
  background: #eef2ff;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}
button {
  background: #4f46e5;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}`,
        js: `let count = 0;
const btn = document.getElementById("enrollBtn");
const span = document.getElementById("count");

btn.addEventListener("click", () => {
  count += 1;
  span.textContent = count;
  console.log("Button clicked:", count);
});
console.log("Web preview ready!");`,
      },
    ],
  },
  {
    id: "react",
    label: "React JSX (MERN)",
    group: "Web & MERN",
    editorLang: "jsx",
    fileExt: "App.jsx",
    supportsStdin: false,
    runtimeBadge: "React 18 + Sucrase JSX Sandbox",
    description: "Write React hooks & JSX components (useState, useMemo, props, events) compiled live inside a secure iframe.",
    templates: [
      {
        name: "MERN Task Tracker Component",
        css: `body { font-family: system-ui, sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
.app { max-width: 440px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
.row { display: flex; gap: 8px; margin-bottom: 14px; }
input { flex: 1; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; }
button { background: #4f46e5; color: #fff; border: 0; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; }
li { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
.done { text-decoration: line-through; color: #94a3b8; }`,
        code: `const { useState } = React;

function App() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Build MongoDB Schema", done: true },
    { id: 2, title: "Create Express REST Routes", done: false },
    { id: 3, title: "Connect React Frontend", done: false },
  ]);
  const [draft, setDraft] = useState("");

  function addTask(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setTasks([...tasks, { id: Date.now(), title: draft.trim(), done: false }]);
    setDraft("");
    console.log("Added MERN task:", draft.trim());
  }

  function toggleTask(id) {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  return (
    <div className="app">
      <h2 style={{ marginTop: 0 }}>MERN Sprint Checklist</h2>
      <form className="row" onSubmit={addTask}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a sprint task..."
        />
        <button type="submit">Add</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {tasks.map((task) => (
          <li key={task.id}>
            <span
              className={task.done ? "done" : ""}
              style={{ cursor: "pointer" }}
              onClick={() => toggleTask(task.id)}
            >
              {task.done ? "✅" : "⬜"} {task.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
`,
      },
    ],
  },
  {
    id: "javascript",
    label: "JavaScript / Node Logic",
    group: "Web & MERN",
    editorLang: "javascript",
    fileExt: "script.js",
    supportsStdin: false,
    runtimeBadge: "Isolated ES6+ Sandbox",
    description: "Run modern JavaScript algorithms, JSON transforms, Express-style route handlers, and async logic securely.",
    templates: [
      {
        name: "REST Payload & Array Aggregations",
        stdin: "",
        code: `// Simulated MERN API Data Transform
const enrollments = [
  { student: "Aarav", course: "MERN Stack", score: 92 },
  { student: "Priya", course: "MERN Stack", score: 88 },
  { student: "Kiran", course: "Data Analytics", score: 95 },
  { student: "Sneha", course: "Java Full Stack", score: 84 },
];

const mernStudents = enrollments
  .filter((item) => item.course === "MERN Stack")
  .map((item) => ({ ...item, status: item.score >= 85 ? "Distinction" : "Pass" }));

console.log("MERN Cohort:", JSON.stringify(mernStudents, null, 2));

const avg = enrollments.reduce((sum, x) => sum + x.score, 0) / enrollments.length;
console.log("Overall Average Score:", avg.toFixed(2));
`,
      },
    ],
  },
  {
    id: "testing",
    label: "Unit Testing Lab",
    group: "Testing & QA",
    editorLang: "javascript",
    fileExt: "suite.test.js",
    supportsStdin: false,
    runtimeBadge: "Test Assertion Runner (describe / test / expect)",
    description: "Write automated unit tests, edge-case assertions, and API payload validators using built-in test assertions.",
    templates: [
      {
        name: "E-Commerce Cart Unit Test Suite",
        stdin: "",
        code: `// Application Function Under Test
function calculateCartTotal(items, couponCode) {
  if (!Array.isArray(items)) throw new Error("Items must be an array");
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  if (couponCode === "SAVE20") return Number((subtotal * 0.8).toFixed(2));
  return Number(subtotal.toFixed(2));
}

// Automated QA Test Suite
describe("Cart Discount Calculator", () => {
  test("calculates standard total without coupon", () => {
    const total = calculateCartTotal([{ price: 50, qty: 2 }, { price: 25, qty: 1 }]);
    expect(total).toBe(125);
  });

  test("applies 20% discount for SAVE20 coupon", () => {
    const total = calculateCartTotal([{ price: 100, qty: 1 }], "SAVE20");
    expect(total).toBe(80);
  });

  test("throws error on invalid cart input", () => {
    expect(() => calculateCartTotal(null)).toThrow("Items must be an array");
  });
});
`,
      },
    ],
  },
];

// Cached runtimes (lazy-loaded on demand)
let cachedSqlJs = null;
let cachedSqlDb = null;
let cachedPyodide = null;
let pyodideLoadPromise = null;
let cachedJavaRuntime = null;
let javaInitPromise = null;
let cachedReactScripts = null;

function createUniqueRunId() {
  return `lf-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------- Cloud Edge Function Optional Execution ----------------
export async function tryCloudCompiler({ supabase, language, source, stdin }) {
  if (!supabase) return { configured: false };
  try {
    const { data, error } = await supabase.functions.invoke("code-runner", {
      body: { language, source, stdin },
    });
    if (error) return { configured: false };
    return data || { configured: false };
  } catch {
    return { configured: false };
  }
}

// ---------------- SQLite (sql.js) ----------------
export async function resetSqlDatabase() {
  if (cachedSqlDb) {
    try { cachedSqlDb.close(); } catch {}
    cachedSqlDb = null;
  }
  return getSqlDatabase();
}

export async function getSqlDatabase() {
  if (!cachedSqlJs) {
    const mod = await import("sql.js");
    const initSqlJs = mod.default || mod;
    cachedSqlJs = await initSqlJs({
      locateFile: (file) => `/compilers/sql/${file}`,
    });
  }
  if (!cachedSqlDb) {
    cachedSqlDb = new cachedSqlJs.Database();
    cachedSqlDb.run(SQL_SEED_SCRIPT);
  }
  return cachedSqlDb;
}

export async function getSqlSchemaSnapshot() {
  const db = await getSqlDatabase();
  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
  if (!tablesRes.length) return [];
  const tableNames = tablesRes[0].values.map((r) => r[0]);
  return tableNames.map((table) => {
    const info = db.exec(`PRAGMA table_info("${table.replaceAll('"', '""')}");`);
    const columns = info.length ? info[0].values.map((row) => ({ name: row[1], type: row[2] || "ANY" })) : [];
    return { table, columns };
  });
}

export async function runSqlBrowser(queryText) {
  const started = performance.now();
  try {
    const db = await getSqlDatabase();
    const results = db.exec(queryText);
    const schema = await getSqlSchemaSnapshot();
    const runMs = Math.round(performance.now() - started);
    return {
      ok: true,
      sqlResults: results,
      schema,
      rowsModified: db.getRowsModified(),
      stdout: results.length
        ? `Executed successfully (${results.length} result set${results.length > 1 ? "s" : ""}).`
        : `Statement executed cleanly (${db.getRowsModified()} row(s) affected).`,
      stderr: "",
      runMs,
      engine: "SQLite 3 WASM (Browser)",
    };
  } catch (err) {
    return {
      ok: false,
      sqlResults: [],
      stdout: "",
      stderr: err?.message || String(err),
      runMs: Math.round(performance.now() - started),
      engine: "SQLite 3 WASM (Browser)",
    };
  }
}

// ---------------- Java (javac + TeaVM WASM) ----------------
async function ensureJavaScriptTag() {
  if (typeof window !== "undefined" && window.JavaWasm) return window.JavaWasm;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-learnforge-java="true"]');
    if (existing && window.JavaWasm) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "/compilers/java/java-wasm.iife.js";
    script.async = true;
    script.dataset.learnforgeJava = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Java WASM toolchain from /compilers/java/java-wasm.iife.js"));
    document.head.appendChild(script);
  });
  return window.JavaWasm;
}

export async function runJavaBrowser(source, stdin = "", onStatus) {
  if (!cachedJavaRuntime) {
    if (!javaInitPromise) {
      javaInitPromise = (async () => {
        onStatus?.("Initializing OpenJDK javac + TeaVM WebAssembly toolchain...");
        const JavaWasm = await ensureJavaScriptTag();
        cachedJavaRuntime = await JavaWasm.createRuntime({
          baseUrl: `${window.location.origin}/compilers/java/`,
          persistFiles: false,
        });
        return cachedJavaRuntime;
      })().catch((err) => {
        javaInitPromise = null;
        throw err;
      });
    }
    await javaInitPromise;
  }

  // Detect class with main method or default to Main
  const publicMatch = source.match(/public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (publicMatch && publicMatch[1] !== "Main") {
    return {
      ok: false,
      stdout: "",
      stderr: `Tip: The in-browser Java compiler compiles source inside Main.java.\nPlease rename "public class ${publicMatch[1]}" to "public class Main" (or remove "public" before class).`,
      engine: "OpenJDK 25 javac + TeaVM WASM",
    };
  }

  onStatus?.("Compiling Java & generating WebAssembly...");
  const result = await cachedJavaRuntime.run(source, { input: stdin || "", mainClass: "Main" });
  return {
    ok: Boolean(result.ok),
    stdout: result.stdout || "",
    stderr: result.stderr || result.error || "",
    runMs: Math.round((result.compileMs || 0) + (result.generateMs || 0) + (result.runMs || 0)),
    engine: "OpenJDK 25 javac + TeaVM WASM",
  };
}

// ---------------- Python & Data Analytics (Pyodide WASM) ----------------
async function ensurePyodideScript() {
  if (typeof window !== "undefined" && window.loadPyodide) return window.loadPyodide;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-learnforge-pyodide="true"]');
    if (existing && window.loadPyodide) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
    script.async = true;
    script.dataset.learnforgePyodide = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Pyodide runtime. Check your network connection."));
    document.head.appendChild(script);
  });
  return window.loadPyodide;
}

export async function runPythonBrowser(source, stdin = "", { analyticsMode = false, csvText = SAMPLE_SALES_CSV, onStatus } = {}) {
  const started = performance.now();
  try {
    if (!cachedPyodide) {
      if (!pyodideLoadPromise) {
        pyodideLoadPromise = (async () => {
          onStatus?.("Downloading Python 3.12 WebAssembly runtime (one-time per session)...");
          const loadPyodide = await ensurePyodideScript();
          cachedPyodide = await loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
          });
          return cachedPyodide;
        })().catch((err) => {
          pyodideLoadPromise = null;
          throw err;
        });
      }
      await pyodideLoadPromise;
    }

    const pyodide = cachedPyodide;

    if (analyticsMode) {
      onStatus?.("Loading numpy, pandas & matplotlib packages...");
      await pyodide.loadPackage(["numpy", "pandas", "matplotlib"]);
    } else {
      // Auto-load analytics libraries if student explicitly imports them in Python tab too
      const needsAnalytics = /\b(?:import|from)\s+(?:pandas|numpy|matplotlib)\b/.test(source);
      if (needsAnalytics) {
        onStatus?.("Loading imported scientific packages (numpy / pandas / matplotlib)...");
        await pyodide.loadPackage(["numpy", "pandas", "matplotlib"]);
      }
    }

    onStatus?.("Executing Python script...");
    pyodide.FS.writeFile("data.csv", csvText || SAMPLE_SALES_CSV);

    const hasMatplotlib = /\bmatplotlib\b/.test(source);
    const stdinLines = (stdin || "").replace(/\r\n/g, "\n").split("\n");

    pyodide.globals.set("__lf_stdin_lines", stdinLines);
    pyodide.globals.set("__lf_user_code", source);

    const harness = `
import sys, io, os, builtins, base64, traceback
os.environ["MPLBACKEND"] = "AGG"

_stdout_buf = io.StringIO()
_stderr_buf = io.StringIO()
_stdin_queue = list(__lf_stdin_lines.to_py())
_charts = []

def _custom_input(prompt=""):
    if prompt:
        _stdout_buf.write(str(prompt))
    if not _stdin_queue:
        raise EOFError("EOF when reading a line (add input lines in Stdin Input)")
    val = _stdin_queue.pop(0)
    _stdout_buf.write(val + "\\n")
    return val

_orig_stdout, _orig_stderr, _orig_input = sys.stdout, sys.stderr, builtins.input
sys.stdout = _stdout_buf
sys.stderr = _stderr_buf
builtins.input = _custom_input
_exec_ok = True

try:
    if ${hasMatplotlib ? "True" : "False"}:
        import matplotlib
        matplotlib.use("Agg", force=True)
        import matplotlib.pyplot as plt
        plt.close("all")
        plt.show = lambda *a, **kw: None
    exec(compile(__lf_user_code, "<learnforge_lab>", "exec"), {"__name__": "__main__"})
    if ${hasMatplotlib ? "True" : "False"}:
        import matplotlib.pyplot as plt
        for fignum in plt.get_fignums():
            fig = plt.figure(fignum)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=130)
            _charts.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
        plt.close("all")
except Exception:
    _exec_ok = False
    traceback.print_exc(file=_stderr_buf)
finally:
    sys.stdout = _orig_stdout
    sys.stderr = _orig_stderr
    builtins.input = _orig_input

{"ok": _exec_ok, "stdout": _stdout_buf.getvalue(), "stderr": _stderr_buf.getvalue(), "charts": _charts}
`;

    const pyRes = await pyodide.runPythonAsync(harness);
    const result = pyRes.toJs({ dict_converter: Object.fromEntries });
    pyRes.destroy?.();

    return {
      ok: Boolean(result.ok),
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      charts: Array.isArray(result.charts) ? result.charts : [],
      runMs: Math.round(performance.now() - started),
      engine: analyticsMode ? "Pyodide + Pandas + Matplotlib (WASM)" : "Pyodide Python 3.12 (WASM)",
    };
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      stderr: err?.message || String(err),
      charts: [],
      runMs: Math.round(performance.now() - started),
      engine: "Pyodide Python 3.12 (WASM)",
    };
  }
}

// ---------------- C / C++ (JSCPP Browser Interpreter) ----------------
export async function runCppBrowser(source, stdin = "", langLabel = "C++") {
  const started = performance.now();
  let output = "";
  try {
    const mod = await import("JSCPP");
    const JSCPP = mod.default || mod;
    const exitCode = JSCPP.run(source, stdin || "", {
      maxTimeout: 5000,
      stdio: {
        write: (s) => {
          output += s;
        },
      },
    });
    return {
      ok: exitCode === 0 || exitCode === undefined,
      stdout: output,
      stderr: exitCode && exitCode !== 0 ? `Program exited with code ${exitCode}` : "",
      runMs: Math.round(performance.now() - started),
      engine: `${langLabel} In-Browser Interpreter`,
    };
  } catch (err) {
    return {
      ok: false,
      stdout: output,
      stderr: err?.message || String(err),
      runMs: Math.round(performance.now() - started),
      engine: `${langLabel} In-Browser Interpreter`,
    };
  }
}

// ---------------- React / Web / JS Isolated Sandbox Builders ----------------
async function getReactUmdScripts() {
  if (cachedReactScripts) return cachedReactScripts;
  const [reactRes, domRes] = await Promise.all([
    fetch("/compilers/react/react.production.min.js"),
    fetch("/compilers/react/react-dom.production.min.js"),
  ]);
  if (!reactRes.ok || !domRes.ok) {
    throw new Error("Could not load React runtime assets from /compilers/react/");
  }
  const [reactCode, domCode] = await Promise.all([reactRes.text(), domRes.text()]);
  cachedReactScripts = { reactCode, domCode };
  return cachedReactScripts;
}

function buildConsoleBridgeScript(runId) {
  return `
  (function() {
    var RUN_ID = ${JSON.stringify(runId)};
    function post(type, text, meta) {
      try {
        window.parent.postMessage({ source: "learnforge-sandbox", runId: RUN_ID, type: type, text: text, meta: meta || null }, "*");
      } catch (_) {}
    }
    function formatArg(arg) {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack || arg.message;
      try { return JSON.stringify(arg, null, 2); } catch (_) { return String(arg); }
    }
    ["log", "info", "warn", "error"].forEach(function(level) {
      var orig = console[level];
      console[level] = function() {
        var msg = Array.prototype.slice.call(arguments).map(formatArg).join(" ");
        post(level === "error" ? "stderr" : level === "warn" ? "warn" : "stdout", msg);
        if (orig) orig.apply(console, arguments);
      };
    });
    window.addEventListener("error", function(ev) {
      post("stderr", (ev.error && (ev.error.stack || ev.error.message)) || ev.message || "Runtime Error");
    });
    window.addEventListener("unhandledrejection", function(ev) {
      post("stderr", "Unhandled Promise Rejection: " + formatArg(ev.reason));
    });
    window.__lfPost = post;
  })();
  `;
}

export function buildWebPreviewHtml({ html = "", css = "", js = "" }) {
  const runId = createUniqueRunId();
  const safeJs = js.replace(/<\/script>/gi, "<\\/script>");
  const safeCss = css.replace(/<\/style>/gi, "<\\/style>");
  return {
    runId,
    srcDoc: `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${safeCss}</style>
</head>
<body>
  ${html}
  <script>${buildConsoleBridgeScript(runId)}<\/script>
  <script>
    try {
      ${safeJs}
    } catch (e) {
      console.error(e);
    }
  <\/script>
</body>
</html>`,
  };
}

export async function buildReactPreviewHtml({ jsx = "", css = "" }) {
  const runId = createUniqueRunId();
  const transformed = sucraseTransform(jsx, { transforms: ["jsx"] }).code;
  const { reactCode, domCode } = await getReactUmdScripts();
  const safeJs = transformed.replace(/<\/script>/gi, "<\\/script>");
  const safeCss = css.replace(/<\/style>/gi, "<\\/style>");
  const safeReact = reactCode.replace(/<\/script>/gi, "<\\/script>");
  const safeDom = domCode.replace(/<\/script>/gi, "<\\/script>");

  return {
    runId,
    srcDoc: `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${safeCss}</style>
</head>
<body>
  <div id="root"></div>
  <script>${buildConsoleBridgeScript(runId)}<\/script>
  <script>${safeReact}<\/script>
  <script>${safeDom}<\/script>
  <script>
    try {
      ${safeJs}
    } catch (e) {
      console.error(e);
    }
  <\/script>
</body>
</html>`,
  };
}

export function buildJsSandboxHtml(js = "", { testingMode = false } = {}) {
  const runId = createUniqueRunId();
  const safeJs = js.replace(/<\/script>/gi, "<\\/script>");
  const testFramework = testingMode
    ? `
    var __passed = 0, __failed = 0;
    function describe(name, fn) {
      console.log("\\n📦 Suite: " + name);
      fn();
    }
    function test(name, fn) {
      try {
        fn();
        __passed++;
        console.log("  ✅ PASS: " + name);
      } catch (err) {
        __failed++;
        console.error("  ❌ FAIL: " + name + "\\n     -> " + (err && err.message ? err.message : err));
      }
    }
    var it = test;
    function expect(actual) {
      return {
        toBe: function(expected) {
          if (!Object.is(actual, expected)) {
            throw new Error("Expected " + JSON.stringify(expected) + " but received " + JSON.stringify(actual));
          }
        },
        toEqual: function(expected) {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error("Expected " + JSON.stringify(expected) + " but received " + JSON.stringify(actual));
          }
        },
        toBeTruthy: function() {
          if (!actual) throw new Error("Expected value to be truthy, received " + JSON.stringify(actual));
        },
        toContain: function(item) {
          if (!actual || !actual.includes || !actual.includes(item)) {
            throw new Error("Expected " + JSON.stringify(actual) + " to contain " + JSON.stringify(item));
          }
        },
        toThrow: function(expectedMsg) {
          if (typeof actual !== "function") throw new Error("expect(fn).toThrow() requires a function");
          var threw = false;
          try { actual(); } catch (err) {
            threw = true;
            if (expectedMsg && !String(err.message || err).includes(expectedMsg)) {
              throw new Error('Expected error containing "' + expectedMsg + '" but got "' + err.message + '"');
            }
          }
          if (!threw) throw new Error("Expected function to throw an error, but it did not throw");
        }
      };
    }
    `
    : "";

  const finalize = testingMode
    ? `console.log("\\n-----------------------------------"); console.log("Summary: " + __passed + " passed, " + __failed + " failed"); window.__lfPost("done", "", { passed: __passed, failed: __failed });`
    : `window.__lfPost("done", "", {});`;

  return {
    runId,
    srcDoc: `<!doctype html>
<html><head><meta charset="utf-8" /></head>
<body>
  <script>${buildConsoleBridgeScript(runId)}<\/script>
  <script>
    ${testFramework}
    try {
      ${safeJs}
    } catch (e) {
      console.error(e);
    } finally {
      ${finalize}
    }
  <\/script>
</body></html>`,
  };
}
