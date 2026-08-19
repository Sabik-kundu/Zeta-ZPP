# Zeta — ZETA++ Language Interpreter

Run `.zpp` programs from any terminal, just like Python or Node.js.

```
zeta run myprogram.zpp
```

---

## Installation

### Requirements
- [Node.js](https://nodejs.org) **v14 or newer**

### Install globally

```bash
# 1. Enter the zeta folder
cd zeta

# 2. Install globally
npm install -g .
```

That's it. Now `zeta` is available everywhere on your system.

### Verify installation

```bash
zeta version
```

### Uninstall

```bash
npm uninstall -g zeta-lang
```

---

## Usage

```bash
zeta run <file.zpp>         # Run a ZETA++ file
zeta check <file.zpp>       # Check syntax without running
zeta repl                   # Start interactive REPL (or just: zeta)
zeta help                   # Show help
zeta version                # Show version
```

### Examples

```bash
zeta run hello.zpp
zeta run ./programs/fibonacci.zpp
zeta check myfile.zpp
```

---

## ZETA++ Language Reference

### Variables

```zpp
num  x = 42;
str  s = "hello";
bool b = true;
let  arr = [1, 2, 3];
set  consts = "immutable";      // constant — cannot be reassigned
```

### Print & Input

```zpp
print("Hello, world!");
str name = input("Enter your name: ");
print("Hi " + name);
```

### If / Else

```zpp
if x > 10 {
  print("big");
} else {
  print("small");
}
```

### Loops

```zpp
// For with range
for i in 0 to 10 { print(i); }

// For with step
for i in 0 to 100 step 5 { print(i); }

// For each (foreach)
let nums = [1, 2, 3];
for each n in nums { print(n); }

// While
while x > 0 { x--; }

// Repeat until (do-while style)
repeat { x++; } until x >= 5;
```

### Functions

```zpp
func add(a, b) {
  return a + b;
}

// Default parameters
func greet(name, greeting = "Hello") {
  print(greeting + ", " + name);
}

// Variadic
func sum(...nums) {
  return reduce(nums, fn(acc, n) => acc + n, 0);
}
```

### Lambdas

```zpp
let sq = fn(n) => n * n;
let add = fn(a, b) => a + b;

// Block lambda
let greet = fn(name) {
  print("Hi " + name);
};
```

### Structs

```zpp
struct Point {
  num x;
  num y;
  fn distance() {
    return sqrt(self.x * self.x + self.y * self.y);
  }
}

Point p;
p.x = 3;
p.y = 4;
print(p.distance());   // 5
```

### Enums

```zpp
enum Color { RED GREEN BLUE }
print(Color.RED);     // 0
print(Color.GREEN);   // 1
```

### Pattern Matching

```zpp
match score {
  on 100 => { print("Perfect!"); }
  on 90  => { print("Excellent"); }
  else   => { print("Keep trying"); }
}
```

### Ternary Expression

```zpp
str label = when x > 0 then "positive" else "negative";
```

### Error Handling

```zpp
attempt {
  raise "Something went wrong";
} rescue e {
  print("Caught: " + e);
}
```

### Destructuring

```zpp
let [a, b, c] = [1, 2, 3];
let {x, y}    = point;
```

### Operators

```zpp
// Arithmetic:   + - * / %
// Comparison:   == != < > <= >=
// Logical:      && || !
// Bitwise:      & | ^ ~ << >>
// Compound:     += -= *= /= %= &= |= ^=
// Increment:    x++  x--
// Type check:   x is num    x is MyStruct
// Membership:   3 in arr    "key" in obj
```

### Functional Array Methods

```zpp
let nums = [1, 2, 3, 4, 5];
let evens   = nums.filter(fn(n) => n % 2 == 0);
let doubled = nums.map(fn(n) => n * 2);
let total   = nums.reduce(fn(acc, n) => acc + n, 0);
let found   = nums.find(fn(n) => n > 3);
```

---

## Standard Libraries

Import any library at the top of your `.zpp` file:

```zpp
#import["math.zl"];
#import["time.zl"];
#import["net.zl"];
#import["convert.zl"];
#import["random.zl"];
#import["str.zl"];
#import["algo.zl"];
#import["ml.zl"];
```

### math.zl
`factorial`, `isPrime`, `gcd`, `lcm`, `fibonacci`, `fibSequence`, `primes`,
`combination`, `permutation`, `degrees`, `radians`, `sinD`, `cosD`, `tanD`,
`median`, `mode`, `variance`, `stddev`, `matMul`, `matTranspose`, `clamp`, `lerp`

### time.zl
`now`, `year`, `month`, `day`, `hour`, `minute`, `second`, `millisecond`,
`dayOfWeek`, `monthName`, `dateStr`, `timeStr`, `timestamp`, `formatTime`,
`timerStart`, `timerEnd`, `timerElapsed`, `unixNow`, `daysBetween`, `startClock`, `stopClock`

### net.zl
`fetchText`, `fetchLines`, `fetchJSON`, `fetchCSV`, `fetchTable`,
`jsonGet`, `jsonKeys`, `jsonToArray`
> Requires `curl` or `wget` on your system.

### convert.zl
`cToF`, `fToC`, `cToK`, `kToC`, `kmToMiles`, `milesToKm`, `mToFt`, `ftToM`,
`kgToLbs`, `lbsToKg`, `kmhToMph`, `mphToKmh`, `bytesToKB`, `bytesToMB`, `formatBytes`

### random.zl
`uuid`, `shuffle`, `pick`, `sample`, `dice`, `coinFlip`, `randInt`, `randFloat`,
`randBool`, `gaussianRandom`, `setSeed`, `randSeed`

### str.zl
`countOccurrences`, `isPalindrome`, `titleCase`, `camelCase`, `snakeCase`,
`capitalize`, `wordWrap`, `countWords`, `reverseStr`, `reverseWords`,
`isNumStr`, `isEmailStr`, `isURLStr`, `lpad`, `rpad`, `center`, `template`

### algo.zl
`makeStack`, `makeQueue`, `makeMinPQ`, `makeNode`, `makeLinkedList`, `makeGraph`

### ml.zl
Full machine learning library:
- **Preprocessing**: `normalize`, `standardize`, `trainTestSplit`, `oneHotEncode`
- **Metrics**: `accuracy`, `mse`, `rmse`, `r2score`, `confusionMatrix`, `f1score`
- **Models**: `LinearRegression`, `LogisticRegression`, `KNNClassifier`, `DecisionTree`, `RandomForest`, `LinearSVM`, `KMeans`, `DBSCAN`, `MLP`, `PCA`, `AdaBoost`, `GradientBoosting`
- **Datasets**: `loadIris`, `loadHousing`, `loadXOR`, `loadMoons`
- **Tools**: `crossValScore`, `gridSearch`, `saveModel`, `loadModel`

---

## Importing Other .zpp Files

```zpp
#import["utils.zpp"];   // includes another ZETA++ file inline
```

Paths are resolved relative to the file being run.

---

## Debugging

```bash
# Show full Node.js stack trace on error
ZETA_TRACE=1 zeta run myfile.zpp
```

---

## Built-in Functions (always available)

| Function | Description |
|---|---|
| `print(...)` | Print to stdout |
| `input(prompt)` | Read a line from stdin |
| `len(x)` | Length of string or array |
| `range(a, b, step?)` | Create number array |
| `toNum(x)` | Convert to number |
| `toStr(x)` | Convert to string |
| `toBool(x)` | Convert to boolean |
| `typeOf(x)` | Get type as string |
| `abs`, `ceil`, `floor`, `round`, `sqrt`, `pow` | Math |
| `sin`, `cos`, `tan`, `atan2`, `hypot` | Trigonometry |
| `max`, `min`, `random`, `randomInt` | Misc math |
| `upper`, `lower`, `trim`, `split`, `join` | Strings |
| `push`, `pop`, `shift`, `unshift`, `splice` | Arrays |
| `sort`, `sortDesc`, `reverse` | Sorting |
| `map`, `filter`, `reduce`, `find`, `every`, `some` | Functional |
| `toJSON`, `fromJSON` | JSON |

---

## Adding New Libraries

Drop any new library `.js` file into `src/libs/` and it automatically loads the next time you run `zeta`. No other changes needed.

Rules your library file must follow (same as the existing ones):
- Register to `DSALibraries['name.zl']` — e.g. `DSALibraries['mylib.zl'] = { inject(G) { ... } }`
- The global `DSALibraries` object is already set before your file is loaded

```bash
# Example: add a new library
cp mylib.js  zeta/src/libs/mylib.js
# Done — now users can do:  #import[mylib.zl];
```

---

## License
MIT
