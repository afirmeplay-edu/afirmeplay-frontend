"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, PieChart, Pie, Cell, Tooltip, Legend, LabelList, Sector } from "recharts"
import { useMemo } from "react"
import { MunicipalReferenceLineSegment } from "@/components/charts/MunicipalReferenceLineSegment"
import { resolveMunicipalReferenceSegmentFromBarData } from "@/utils/reports/presentation19/municipalReferenceLine"

interface BarChartProps {
    data: Array<{
        name: string
        value: number
    }>
    title: string
    subtitle?: string
    color?: string
    yAxisDomain?: [number, number]
    yAxisLabel?: string
    showValues?: boolean // Nova prop para controlar exibição dos valores
    /** Linha de referência municipal (topo da barra → demais categorias). */
    municipalReferenceLine?: {
        y: number
        anchorName: string
    }
}

interface PieChartProps {
    data: Array<{
        name: string
        value: number
    }>
    title: string
    subtitle?: string
    colors?: string[]
    showValues?: boolean // Nova prop para controlar exibição dos valores
}

const defaultColors = [
    "#dc2626", // vermelho - Abaixo do Básico
    "#eab308", // amarelo - Básico
    "#22c55e", // verde - Adequado
    "#15803d", // verde escuro - Avançado
]

// Formata valor para exibição (evita 2.0000000000000004 por causa de float)
function formatBarValue(value: number): string {
    const n = Number(value);
    if (Number.isInteger(n)) return String(n);
    if (Number.isNaN(n)) return '0';
    return n.toFixed(1);
}

// Componente para renderizar valores nas barras
const renderCustomBarLabel = (props: { x: number; y: number; width: number; height: number; value: number }) => {
    const { x, y, width, height, value } = props;
    if (value === 0) return null; // Não mostrar 0
    
    // Detectar modo escuro
    const isDarkMode = document.documentElement.classList.contains('dark');
    const fillColor = isDarkMode ? 'hsl(var(--foreground))' : '#374151';
    
    return (
        <text
            x={x + width / 2}
            y={y - 5}
            textAnchor="middle"
            fill={fillColor}
            fontSize={12}
            fontWeight={500}
        >
            {formatBarValue(value)}
        </text>
    );
};

export function BarChartComponent({
    data,
    title,
    subtitle,
    color = "#22c55e",
    yAxisDomain = [0, 10],
    yAxisLabel = "Valor",
    showValues = true, // Valor padrão true
    municipalReferenceLine,
}: BarChartProps) {
    const municipalSegment = useMemo(
        () =>
            municipalReferenceLine
                ? resolveMunicipalReferenceSegmentFromBarData(
                      data,
                      municipalReferenceLine.anchorName,
                      municipalReferenceLine.y
                  )
                : null,
        [data, municipalReferenceLine]
    );

    // Detectar modo escuro para ajustar cores
    const isDarkMode =
        (typeof document !== "undefined" &&
          (document.documentElement.classList.contains("dark") ||
            document.body.classList.contains("dark")));
    const axisColor = isDarkMode ? 'hsl(var(--muted-foreground))' : '#888888';
    const gridColor = isDarkMode ? 'hsl(var(--border))' : '#e5e7eb';
    
    return (
        <div className="space-y-4">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.7} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="name"
                        stroke={axisColor}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: isDarkMode ? 'hsl(var(--foreground))' : '#374151' }}
                    />
                    <YAxis
                        stroke={axisColor}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        domain={yAxisDomain}
                        label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fill: isDarkMode ? 'hsl(var(--foreground))' : '#374151' }}
                        tick={{ fill: isDarkMode ? 'hsl(var(--foreground))' : '#374151' }}
                        tickFormatter={(value) => {
                            const n = Number(value);
                            if (Number.isInteger(n)) return String(n);
                            if (Math.abs(n) < 0.01 || Math.abs(n) > 1e6) return n.toExponential(0);
                            return n.toFixed(1);
                        }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: isDarkMode ? 'hsl(var(--card))' : 'hsl(var(--card))',
                            border: isDarkMode
                                ? `1px solid hsl(var(--border) / 0.15)`
                                : `1px solid hsl(var(--border) / 0.8)`,
                            borderRadius: '0.5rem',
                            boxShadow: isDarkMode ? '0 4px 6px -1px rgba(0, 0, 0, 0.3)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                        }}
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="rounded-lg border bg-card p-3 shadow-lg border-border dark:border-border/30">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium uppercase text-muted-foreground">
                                                {label}
                                            </span>
                                            <span className="text-lg font-bold text-foreground">
                                                {typeof payload[0].value === 'number' ? formatBarValue(payload[0].value) : payload[0].value}
                                            </span>
                                        </div>
                                    </div>
                                )
                            }
                            return null
                        }}
                    />
                    <Bar
                        dataKey="value"
                        fill={color}
                        stroke={
                            // No dark, deixar o contorno bem sutil (evita borda/hover branco).
                            isDarkMode ? "hsl(var(--border) / 0.10)" : "hsl(var(--border) / 0.65)"
                        }
                        strokeWidth={isDarkMode ? 0.5 : 1}
                        radius={[4, 4, 0, 0]}
                        style={{
                            cursor: 'pointer',
                            transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            if (e.currentTarget) {
                                e.currentTarget.style.opacity = '0.8';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (e.currentTarget) {
                                e.currentTarget.style.opacity = '1';
                            }
                        }}
                    >
                        {showValues && <LabelList content={renderCustomBarLabel} />}
                        <MunicipalReferenceLineSegment
                            segment={municipalSegment}
                            dataKey="value"
                            categoryKey="name"
                        />
                    </Bar>
                </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

// Componente para renderizar valores nos gráficos de pizza/donut
const renderCustomPieLabel = (entry: { name: string; value: number }) => {
    if (entry.value === 0) return null; // Não mostrar 0
    return `${entry.value}`;
};

export function PieChartComponent({
    data,
    title,
    subtitle,
    colors = defaultColors,
    showValues = true // Valor padrão true
}: PieChartProps) {
    // Calcular total uma vez para usar no tooltip
    const total = data.reduce((sum: number, item: { value: number }) => sum + item.value, 0)
    
    // Detectar modo escuro
    const isDarkMode =
        (typeof document !== "undefined" &&
          (document.documentElement.classList.contains("dark") ||
            document.body.classList.contains("dark")));

    // Controle do destaque ao passar o mouse nos setores (evita borda branca forte no modo escuro)
    const renderActiveShape = (props: any) => {
        const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
        return (
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                stroke={isDarkMode ? "hsl(var(--border) / 0.10)" : "#ffffff"}
                strokeWidth={isDarkMode ? 0.6 : 2}
            />
        );
    };

    return (
        <div className="space-y-4">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={showValues ? renderCustomPieLabel : false}
                        labelLine={false}
                        activeShape={renderActiveShape}
                    >
                        {data.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={colors[index % colors.length]}
                                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                                onMouseEnter={(e) => {
                                    if (e.currentTarget) {
                                        e.currentTarget.style.opacity = '0.8';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (e.currentTarget) {
                                        e.currentTarget.style.opacity = '1';
                                    }
                                }}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: isDarkMode ? 'hsl(var(--card))' : 'hsl(var(--card))',
                            border: isDarkMode
                                ? `1px solid hsl(var(--border) / 0.15)`
                                : `1px solid hsl(var(--border) / 0.8)`,
                            borderRadius: '0.5rem',
                            boxShadow: isDarkMode ? '0 4px 6px -1px rgba(0, 0, 0, 0.3)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                        }}
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const item = payload[0].payload
                                const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'

                                return (
                                    <div className="rounded-lg border bg-card p-3 shadow-lg border-border dark:border-border/30">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium uppercase text-muted-foreground">
                                                {item.name}
                                            </span>
                                            <span className="text-lg font-bold text-foreground">
                                                {item.value} ({percentage}%)
                                            </span>
                                        </div>
                                    </div>
                                )
                            }
                            return null
                        }}
                    />
                    {data.length <= 6 && (
                        <Legend
                            layout="horizontal"
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value, entry, index) => (
                                <span className="text-sm text-foreground">{value}</span>
                            )}
                            wrapperStyle={{
                                color: isDarkMode ? 'hsl(var(--foreground))' : '#374151',
                            }}
                        />
                    )}
                </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

export function DonutChartComponent({
    data,
    title,
    subtitle,
    colors = defaultColors,
    showValues = true // Valor padrão true
}: PieChartProps) {
    // Calcular total uma vez para usar no tooltip
    const total = data.reduce((sum: number, item: { value: number }) => sum + item.value, 0)
    
    // Detectar modo escuro
    const isDarkMode =
        (typeof document !== "undefined" &&
          (document.documentElement.classList.contains("dark") ||
            document.body.classList.contains("dark")));

    // Controle do destaque ao passar o mouse nos setores (evita borda branca forte no modo escuro)
    const renderActiveShape = (props: any) => {
        const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
        return (
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                stroke={isDarkMode ? "hsl(var(--border) / 0.10)" : "#ffffff"}
                strokeWidth={isDarkMode ? 0.6 : 2}
            />
        );
    };

    return (
        <div className="space-y-4">
            <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={showValues ? renderCustomPieLabel : false}
                        labelLine={false}
                        activeShape={renderActiveShape}
                    >
                        {data.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={colors[index % colors.length]}
                                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                                onMouseEnter={(e) => {
                                    if (e.currentTarget) {
                                        e.currentTarget.style.opacity = '0.8';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (e.currentTarget) {
                                        e.currentTarget.style.opacity = '1';
                                    }
                                }}
                            />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: isDarkMode ? 'hsl(var(--card))' : 'hsl(var(--card))',
                            border: isDarkMode
                                ? `1px solid hsl(var(--border) / 0.35)`
                                : `1px solid hsl(var(--border) / 0.8)`,
                            borderRadius: '0.5rem',
                            boxShadow: isDarkMode ? '0 4px 6px -1px rgba(0, 0, 0, 0.3)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                        }}
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                const item = payload[0].payload
                                const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'

                                return (
                                    <div className="rounded-lg border bg-card p-3 shadow-lg border-border dark:border-border/30">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium uppercase text-muted-foreground">
                                                {item.name}
                                            </span>
                                            <span className="text-lg font-bold text-foreground">
                                                {item.value} ({percentage}%)
                                            </span>
                                        </div>
                                    </div>
                                )
                            }
                            return null
                        }}
                    />
                    {data.length <= 6 && (
                        <Legend
                            layout="horizontal"
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => (
                                <span className="text-sm text-foreground">{value}</span>
                            )}
                            wrapperStyle={{
                                color: isDarkMode ? 'hsl(var(--foreground))' : '#374151',
                            }}
                        />
                    )}
                </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-center mt-2">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-3 gap-y-2 text-sm w-full max-w-2xl">
                    {data.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2 min-w-0">
                            <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: colors[index % colors.length] }}
                            />
                            <span className="text-foreground truncate whitespace-nowrap" title={item.name}>{item.name}</span>
                            <span className="text-muted-foreground tabular-nums shrink-0">({item.value})</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
} 