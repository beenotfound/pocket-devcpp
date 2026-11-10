/** 课本例题：都是大一 C/C++ 常见题目，点一下就能跑 */

export const EXAMPLES = [
  {
    title: 'A + B（输入两个整数求和）',
    tag: 'C · 顺序结构',
    name: 'a_plus_b.c',
    code: `#include <stdio.h>

int main() {
    int a, b;
    scanf("%d%d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}
`,
    stdin: '1 2',
  },
  {
    title: '判断闰年',
    tag: 'C · 选择结构',
    name: 'leap.c',
    code: `#include <stdio.h>

int main() {
    int y;
    scanf("%d", &y);
    if ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0)
        printf("%d 是闰年\\n", y);
    else
        printf("%d 不是闰年\\n", y);
    return 0;
}
`,
    stdin: '2024',
  },
  {
    title: '九九乘法表',
    tag: 'C · 循环嵌套',
    name: 'table99.c',
    code: `#include <stdio.h>

int main() {
    for (int i = 1; i <= 9; i++) {
        for (int j = 1; j <= i; j++)
            printf("%d*%d=%-3d", j, i, i * j);
        printf("\\n");
    }
    return 0;
}
`,
  },
  {
    title: '最大公约数（递归）',
    tag: 'C · 函数与递归',
    name: 'gcd.c',
    code: `#include <stdio.h>

int gcd(int a, int b) {
    if (b == 0) return a;
    return gcd(b, a % b);
}

int main() {
    int a, b;
    scanf("%d%d", &a, &b);
    printf("%d\\n", gcd(a, b));
    return 0;
}
`,
    stdin: '12 18',
  },
  {
    title: '冒泡排序',
    tag: 'C · 数组',
    name: 'bubble.c',
    code: `#include <stdio.h>

int main() {
    int n, a[100];
    scanf("%d", &n);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);

    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1]) {
                int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t;
            }

    for (int i = 0; i < n; i++) printf("%d ", a[i]);
    printf("\\n");
    return 0;
}
`,
    stdin: '5\n5 3 9 1 7',
  },
  {
    title: '判断素数',
    tag: 'C · 循环 + 函数',
    name: 'prime.c',
    code: `#include <stdio.h>

int is_prime(int n) {
    if (n < 2) return 0;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return 0;
    return 1;
}

int main() {
    int n;
    scanf("%d", &n);
    printf(is_prime(n) ? "是素数\\n" : "不是素数\\n");
    return 0;
}
`,
    stdin: '97',
  },
  {
    title: '字符串反转（辅助数组）',
    tag: 'C · 字符串',
    name: 'reverse.c',
    code: `#include <stdio.h>
#include <string.h>

int main() {
    char s[100], t[100];
    scanf("%s", s);

    int n = strlen(s);
    for (int i = 0; i < n; i++)
        t[i] = s[n - 1 - i];
    t[n] = 0;

    printf("%s\\n", t);
    return 0;
}
`,
    stdin: 'hello',
  },
  {
    title: '水仙花数',
    tag: 'C · 循环',
    name: 'narcissus.c',
    code: `#include <stdio.h>

int main() {
    for (int n = 100; n < 1000; n++) {
        int a = n / 100, b = n / 10 % 10, c = n % 10;
        if (a * a * a + b * b * b + c * c * c == n)
            printf("%d ", n);
    }
    printf("\\n");
    return 0;
}
`,
  },
  {
    title: '二维数组转置',
    tag: 'C · 二维数组',
    name: 'transpose.c',
    code: `#include <stdio.h>

int main() {
    int a[3][3] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
    int b[3][3];
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            b[i][j] = a[j][i];
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) printf("%d ", b[i][j]);
        printf("\\n");
    }
    return 0;
}
`,
  },
  {
    title: 'cin / cout 求和',
    tag: 'C++ · 输入输出',
    name: 'sum_cpp.cpp',
    code: `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
`,
    stdin: '3 4',
  },
  {
    title: '结构体：学生成绩（输入 + 平均分）',
    tag: 'C · 结构体',
    name: 'struct_score.c',
    code: `#include <stdio.h>

struct Student {
    char name[20];
    int score;
};

int main() {
    struct Student a[3];
    for (int i = 0; i < 3; i++)
        scanf("%s%d", a[i].name, &a[i].score);

    int sum = 0;
    for (int i = 0; i < 3; i++) {
        sum += a[i].score;
        printf("%s: %d\\n", a[i].name, a[i].score);
    }
    printf("平均分 = %d\\n", sum / 3);
    return 0;
}
`,
    stdin: 'Ann 88\nBob 92\nCindy 76',
  },
  {
    title: '杨辉三角',
    tag: 'C · 二维数组',
    name: 'yanghui.c',
    code: `#include <stdio.h>

int main() {
    int a[10][10];
    for (int i = 0; i < 10; i++) {
        a[i][0] = 1;
        a[i][i] = 1;
        for (int j = 1; j < i; j++)
            a[i][j] = a[i - 1][j - 1] + a[i - 1][j];
    }
    for (int i = 0; i < 10; i++) {
        for (int j = 0; j <= i; j++) printf("%-4d", a[i][j]);
        printf("\\n");
    }
    return 0;
}
`,
  },
  {
    title: '斐波那契数列（递归）',
    tag: 'C · 递归',
    name: 'fib.c',
    code: `#include <stdio.h>

int fib(int n) {
    if (n <= 2) return 1;
    return fib(n - 1) + fib(n - 2);
}

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", fib(n));
    return 0;
}
`,
    stdin: '10',
  },
];
