// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ContextLevel } from '@/core/constants';
import { toBoolean } from '@/core/transforms/boolean';
import { Component, OnDestroy, OnInit, ElementRef, signal, input, viewChild, effect, resource, untracked } from '@angular/core';
import { CoreFilter, CoreFilterFilter, CoreFilterFormatTextOptions } from '@features/filter/services/filter';
import { CoreFilterHelper } from '@features/filter/services/filter-helper';
import { LegendOptions, ChartTypeRegistry, ChartType, type Chart, LegendItem } from 'chart.js';
import { CoreBaseModule } from '@/core/base.module';
import { CoreFaIconDirective } from '@directives/fa-icon';

/**
 * This component shows a chart using chart.js.
 * Documentation can be found at http://www.chartjs.org/docs/.
 * It only supports changes on these properties: data and labels.
 *
 * Example usage:
 * <core-chart [data]="data" [labels]="labels" [type]="type" [legend]="legend"></core-chart>
 */
@Component({
    selector: 'core-chart',
    templateUrl: 'core-chart.html',
    styleUrl: 'chart.scss',
    imports: [
        CoreBaseModule,
        CoreFaIconDirective,
    ],
})
export class CoreChartComponent implements OnDestroy, OnInit {

    // The first 6 colors will be the app colors, the following will be randomly generated.
    // It will use the same colors in the whole session.
    protected static readonly BACKGROUND_COLORS = [
        'rgba(0,100,210, 0.6)',
        'rgba(203,61,77, 0.6)',
        'rgba(0,121,130, 0.6)',
        'rgba(249,128,18, 0.6)',
        'rgba(94,129,0, 0.6)',
        'rgba(251,173,26, 0.6)',
    ];

    readonly data = input<number[]>([]); // Chart data.
    readonly labels = input<string[]>([]); // Labels of the data.
    readonly type = input.required<CoreChartType>(); // Type of chart.
    readonly legend = input<LegendOptions<ChartType>>(); // Legend options.
    readonly height = input(300); // Height of the chart element.
    readonly filter = input<boolean, unknown>(undefined, { transform: toBoolean }); // Whether to filter labels. If not defined, true if
                                                                           // contextLevel and instanceId are set.
    readonly contextLevel = input<ContextLevel>(); // The context level of the text.
    readonly contextInstanceId = input<number>(); // The instance ID related to the context.
    readonly courseId = input<number>(); // Course ID the text belongs to. It can be used to improve performance with filters.
    readonly wsNotFiltered = input(false, { transform: toBoolean }); // If true it means the WS didn't filter the labels for some reason.

    readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

    readonly chart = signal<ChartWithLegend | undefined>(undefined);
    readonly legendItems = signal<LegendItem[]>([]);

    // Load filters to apply to labels when contextLevel, contextInstanceId or filter change.
    protected readonly labelFilters = resource({
        params: () => ({
            contextLevel: this.contextLevel(),
            contextInstanceId: this.contextInstanceId(),
            filter: this.filter(),
        }),
        loader: async ({ params }): Promise<CoreFilterFilter[] | undefined> => {
            if (!params.contextLevel || !params.contextInstanceId || params.filter === false) {
                return;
            }

            return await CoreFilterHelper.getFilters(params.contextLevel, params.contextInstanceId, this.getFilterOptions());
        },
    });

    // Format labels if labels or filters change.
    protected readonly formattedLabels = resource({
        params: () => ({
            labels: this.labels(),
            filters: this.labelFilters.value(),
        }),
        loader: ({ params }): Promise<string[]> =>
            Promise.all(params.labels.map(label => CoreFilter.formatText(label, this.getFilterOptions(), params.filters))),
    });

    constructor() {
        effect(() => {
            const chart = untracked(this.chart);
            const data = this.data();
            const formattedLabels = this.formattedLabels.value();
            if (!chart) {
                return;
            }

            if (!chart.data.datasets) {
                chart.data.datasets = [];
            }

            chart.data.datasets[0] = {
                data,
                backgroundColor: this.getRandomColors(data.length),
            };
            chart.data.labels = formattedLabels ?? this.labels();
            chart.update();

            this.updateLegendItems();
        });
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        const legendValue = this.legend();
        const legend = legendValue === undefined
            ? {
                display: false,
                labels: {
                    generateLabels: (chart: Chart): LegendItem[] => {
                        const data = chart.data;
                        if (data.labels?.length) {
                            const datasets = data.datasets?.[0];

                            return data.labels.map<LegendItem>((label, i) => ({
                                text: `${label}: ${datasets?.data?.[i]}`,
                                fillStyle: datasets?.backgroundColor?.[i],
                            }));
                        }

                        return [];
                    },
                },
            }
            : { ...legendValue };

        const indexAxis = this.type() === 'bar'
            ? this.data().length < 5 ? 'x' : 'y'
            : undefined;

        const context = this.canvas()?.nativeElement.getContext('2d');
        if (!context) {
            return;
        }

        const { Chart, registerables } = await import('chart.js');

        Chart.register(...registerables);

        this.chart.set(new Chart(context, {
            type: this.type(),
            data: {
                labels: this.formattedLabels.value() ?? this.labels(),
                datasets: [{
                    data: this.data(),
                    backgroundColor: this.getRandomColors(this.data().length),
                }],
            },
            options: {
                indexAxis,
                plugins: {
                    legend,
                },
            },
        }));

        this.updateLegendItems();
    }

    /**
     * Generate random colors if needed.
     *
     * @param n Number of colors needed.
     * @returns Array with the number of background colors requested.
     */
    protected getRandomColors(n: number): string[] {
        while (CoreChartComponent.BACKGROUND_COLORS.length < n) {
            const red = Math.floor(Math.random() * 255);
            const green = Math.floor(Math.random() * 255);
            const blue = Math.floor(Math.random() * 255);
            CoreChartComponent.BACKGROUND_COLORS.push(`rgba(${red}, ${green}, ${blue}, 0.6)`);
        }

        return CoreChartComponent.BACKGROUND_COLORS.slice(0, n);
    }

    /**
     * Get options to use when filtering labels.
     *
     * @returns Options.
     */
    protected getFilterOptions(): CoreFilterFormatTextOptions {
        return {
            clean: true,
            singleLine: true,
            courseId: this.courseId(),
            wsNotFiltered: this.wsNotFiltered(),
        };
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.chart()?.destroy();
    }

    /**
     * Recompute legendItems property.
     */
    protected updateLegendItems(): void {
        this.legendItems.set((this.chart()?.legend?.legendItems ?? []).filter(item => !!item));
    }

}

// For some reason the legend property isn't defined in TS, define it ourselves.
type ChartWithLegend = Chart & {
    legend?: {
        legendItems?: LegendItem[];
    };
};

export type CoreChartType = keyof ChartTypeRegistry;
