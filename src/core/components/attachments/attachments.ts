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

import { Component, computed, input, model, resource } from '@angular/core';
import { FileEntry } from '@awesome-cordova-plugins/file/ngx';

import { CoreFileUploader, CoreFileUploaderTypeList } from '@features/fileuploader/services/fileuploader';
import { CoreSites } from '@services/sites';
import { CoreText } from '@singletons/text';
import { Translate } from '@singletons';
import { CoreNetwork } from '@services/network';
import { CoreFileUploaderHelper } from '@features/fileuploader/services/fileuploader-helper';
import { CoreFileEntry } from '@services/file-helper';
import { CoreCourses } from '@features/courses/services/courses';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { toBoolean } from '@/core/transforms/boolean';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreToasts } from '@services/overlays/toasts';
import { CoreWSFile } from '@services/ws';
import { CoreBaseModule } from '@/core/base.module';
import { CoreLoadingComponent } from '../loading/loading';
import { CoreLocalFileComponent } from '../local-file/local-file';
import { CoreFileComponent } from '../file/file';
import { CoreMarkRequiredComponent } from '@components/mark-required/mark-required';
import { CoreFaIconDirective } from '@directives/fa-icon';
import { CoreUpdateNonReactiveAttributesDirective } from '@directives/update-non-reactive-attributes';

/**
 * Component to render attachments, allow adding more and delete the current ones.
 *
 * All the changes done will be applied to the "files" input array, no file will be uploaded. The code using this
 * component should be the one uploading and moving the files.
 *
 * All the files added will be copied to the app temporary folder, so they should be deleted after uploading them
 * or if the user cancels the action.
 *
 * <core-attachments [(files)]="files" [maxSize]="configs.maxsubmissionsizebytes" [maxSubmissions]="configs.maxfilesubmissions"
 *     [component]="component" [componentId]="assign.cmid" [acceptedTypes]="configs.filetypeslist" [allowOffline]="allowOffline">
 * </core-attachments>
 */
@Component({
    selector: 'core-attachments',
    templateUrl: 'core-attachments.html',
    styleUrl: 'attachments.scss',
    imports: [
        CoreBaseModule,
        CoreFaIconDirective,
        CoreUpdateNonReactiveAttributesDirective,
        CoreLoadingComponent,
        CoreLocalFileComponent,
        CoreFileComponent,
        CoreMarkRequiredComponent,
    ],
})
export class CoreAttachmentsComponent {

    // TODO: Document breaking change and change all usages to use [(files)].
    readonly files = model<CoreFileEntry[]>([]); // List of attachments.
    readonly maxSize = input<number>(); // Max size. -1 means unlimited, 0 means course/user max size, not defined means unknown.
    readonly maxSubmissions = input<number>(); // Max number of attachments. -1 means unlimited, not defined means unknown limit.
    readonly component = input<string>(); // Component the downloaded files will be linked to.
    readonly componentId = input<string | number>(); // Component ID.
    readonly allowOffline = input(false, { transform: toBoolean }); // Whether to allow selecting files in offline.
    readonly acceptedTypes = input<string>(); // List of supported filetypes. If undefined, all types supported.
    readonly required = input(false, { transform: toBoolean }); // Whether to display the required mark.
    readonly courseId = input<number>(); // Course ID.
    readonly title = input(Translate.instant('core.fileuploader.attachedfiles')); // Title to display.

    // The calculated max size, taking into account course/user limits if needed. NaN means unknown max size.
    readonly calculatedMaxSize = resource({
        params: () => ({
            maxSize: this.maxSize(),
            courseId: this.courseId(),
        }),
        loader: async ({ params }): Promise<number> => {
            const maxSize = params.maxSize !== null ? Number(params.maxSize) : NaN;
            if (maxSize !== 0) {
                return maxSize;
            }

            return await this.getMaxSizeOfArea(params.courseId);
        },
    });

    readonly maxSizeReadable = computed(() => {
        const maxSize = this.calculatedMaxSize.value();

        if (maxSize !== undefined && maxSize >= 0) {
            return CoreText.bytesToSize(maxSize, 2);
        } else if (maxSize === -1) {
            return Translate.instant('core.unlimited');
        } else {
            return Translate.instant('core.unknown');
        }
    });

    readonly maxSubmissionsReadable = computed((): string | undefined => {
        const maxSubmissions = this.maxSubmissions();
        if (maxSubmissions === undefined || maxSubmissions < 0) {
            return maxSubmissions === undefined ? Translate.instant('core.unknown') : undefined;
        } else {
            return String(maxSubmissions);
        }
    });

    readonly canAddFile = computed(() => {
        const maxSubmissions = this.maxSubmissions();

        return (maxSubmissions === undefined || maxSubmissions < 0) ?
            true : // Unlimited files.
            this.files().length < maxSubmissions;
    });

    readonly fileTypes = computed<CoreFileUploaderTypeList | undefined>(() => {
        const acceptedTypes = this.acceptedTypes()?.trim();

        return acceptedTypes && acceptedTypes !== '*' ?
            CoreFileUploader.prepareFiletypeList(acceptedTypes) :
            undefined;
    });

    /**
     * Get max size of the area.
     *
     * @param courseId Course ID.
     * @returns Max size, NaN if not found.
     */
    protected async getMaxSizeOfArea(courseId?: number): Promise<number> {
        if (courseId) {
            // Check course max size.
            const course = await CorePromiseUtils.ignoreErrors(CoreCourses.getCourseByField('id', courseId));

            if (course?.maxbytes) {
                return course.maxbytes;
            }
        }

        // Check user max size.
        const currentSite = CoreSites.getCurrentSite();
        const siteInfo = currentSite?.getInfo();

        return siteInfo?.usermaxuploadfilesize ?? NaN;
    }

    /**
     * Add a new attachment.
     */
    async add(): Promise<void> {
        const allowOffline = this.allowOffline();
        if (!allowOffline && !CoreNetwork.isOnline()) {
            CoreAlerts.showError(Translate.instant('core.fileuploader.errormustbeonlinetoupload'));

            return;
        }

        if (this.calculatedMaxSize.isLoading()) {
            // The template shouldn't allow adding a file while the max size is being calculated.
            return;
        }

        const mimetypes = this.fileTypes()?.mimetypes;

        try {
            const result = await CoreFileUploaderHelper.selectFile(this.calculatedMaxSize.value(), allowOffline, undefined, mimetypes);

            this.files.update(files => files.concat(result));
        } catch (error) {
            CoreAlerts.showError(error, { default: 'Error selecting file.' });
        }
    }

    /**
     * Delete a file from the list.
     *
     * @param index The index of the file.
     * @param askConfirm Whether to ask confirm.
     */
    async delete(index: number, askConfirm?: boolean): Promise<void> {

        if (askConfirm) {
            try {
                await CoreAlerts.confirmDelete(Translate.instant('core.confirmdeletefile'));
            } catch {
                // User cancelled.
                return;
            }
        }

        // Status message for screen readers.
        const file = this.files()[index];
        if (file) {
            const filename = (file as CoreWSFile).filename ?? (file as FileEntry).name;
            if (filename) {
                CoreToasts.show({
                    cssClass: 'sr-only',
                    message: Translate.instant('core.filedeletedsuccessfully', { filename }),
                });
            }
        }

        // Remove the file from the list.
        this.files.update(files => files.filter((file, i) => i !== index));
    }

    /**
     * A file was renamed.
     *
     * @param index Index of the file.
     * @param data The data received.
     */
    renamed(index: number, data: { file: FileEntry }): void {
        this.files.update(files => files.map((file, i) => {
            return i === index ? data.file : file;
        }));
    }

}
