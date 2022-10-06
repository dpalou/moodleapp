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

import { OnInit, Input, Component, Optional, Inject } from '@angular/core';
import { CoreLogger } from '@singletons/logger';
import { CoreDomUtils } from '@services/utils/dom';
import { CoreUtils } from '@services/utils/utils';
import { CoreTextUtils } from '@services/utils/text';
import { CoreCourseBlock } from '../../course/services/course';
import { Params } from '@angular/router';
import { ContextLevel } from '@/core/constants';
import { CoreNavigationOptions } from '@services/navigator';
import { AsyncComponent } from '@classes/async-component';
import { CorePromisedValue } from '@classes/promised-value';
import { PageLoadWatcher } from '@classes/page-load-watcher';
import { PageLoadsManager } from '@classes/page-loads-manager';

/**
 * Template class to easily create components for blocks.
 */
@Component({
    template: '',
})
export abstract class CoreBlockBaseComponent implements OnInit, ICoreBlockComponent, AsyncComponent {

    @Input() title!: string; // The block title.
    @Input() block!: CoreCourseBlock; // The block to render.
    @Input() contextLevel!: ContextLevel; // The context where the block will be used.
    @Input() instanceId!: number; // The instance ID associated with the context level.
    @Input() link?: string; // Link to go when clicked.
    @Input() linkParams?: Params; // Link params to go when clicked.
    @Input() navOptions?: CoreNavigationOptions; // Navigation options.

    loaded = false; // If false, the UI should display a loading.
    protected fetchContentDefaultError = ''; // Default error to show when loading contents.
    protected onReadyPromise = new CorePromisedValue<void>();
    protected firstLoadWatcher?: PageLoadWatcher;
    protected loadsManager: PageLoadsManager;

    protected logger: CoreLogger;

    constructor(@Optional() @Inject('') loggerName: string = 'AddonBlockComponent', @Optional() loadsManager?: PageLoadsManager) {
        this.logger = CoreLogger.getInstance(loggerName);

        this.loadsManager = loadsManager ?? new PageLoadsManager();
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        this.startOnInit();

        if (this.block.configs && this.block.configs.length > 0) {
            this.block.configs.forEach((config) => {
                config.value = CoreTextUtils.parseJSON(config.value);
            });

            this.block.configsRecord = CoreUtils.arrayToObject(this.block.configs, 'name');
        }

        await this.loadContent();
    }

    /**
     * Function to be called when ngOnInit starts. If a block overrides ngOnInit, this function should be called at the beginning.
     */
    protected startOnInit(): void {
        if (this.firstLoadWatcher) {
            return;
        }

        this.firstLoadWatcher = this.loadsManager.startComponentLoad(this);
    }

    /**
     * Perform the refresh content function.
     *
     * @param showLoading Whether to show loading.
     * @return Resolved when done.
     */
    protected async refreshContent(showLoading?: boolean): Promise<void> {
        if (showLoading) {
            this.loaded = false;
        }

        // Wrap the call in a try/catch so the workflow isn't interrupted if an error occurs.
        try {
            await this.invalidateContent();
        } catch (ex) {
            // An error ocurred in the function, log the error and just resolve the promise so the workflow continues.
            this.logger.error(ex);
        }

        await this.loadContent();
    }

    /**
     * @inheritdoc
     */
    async invalidateContent(): Promise<void> {
        return;
    }

    /**
     * Loads the component contents and shows the corresponding error.
     */
    protected async loadContent(): Promise<void> {
        const loadWatcher = this.firstLoadWatcher ?? this.loadsManager.startComponentLoad(this);
        this.firstLoadWatcher = undefined;

        // Wrap the call in a try/catch so the workflow isn't interrupted if an error occurs.
        try {
            await this.fetchContent(loadWatcher);
        } catch (error) {
            // An error ocurred in the function, log the error and just resolve the promise so the workflow continues.
            this.logger.error(error);

            // Error getting data, fail.
            CoreDomUtils.showErrorModalDefault(error, this.fetchContentDefaultError, true);
        }

        this.loaded = true;
        this.onReadyPromise.resolve();
    }

    /**
     * Download the component contents.
     *
     * @param loadWatcher Load watcher to manage the requests.
     * @return Promise resolved when done.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async fetchContent(loadWatcher: PageLoadWatcher): Promise<void> {
        return;
    }

    /**
     * Reload content without invalidating data.
     *
     * @return Promise resolved when done.
     */
    async reloadContent(): Promise<void> {
        if (!this.loaded) {
            // Content being loaded, don't do anything.
            return;
        }

        this.loaded = false;
        await this.loadContent();
    }

    /**
     * @inheritdoc
     */
    async ready(): Promise<void> {
        return await this.onReadyPromise;
    }

}

/**
 * Interface for block components.
 */
export interface ICoreBlockComponent {

    /**
     * Perform the invalidate content function.
     */
    invalidateContent(): Promise<void>;

}
